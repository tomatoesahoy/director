import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced, getRequestHeaders, extension_prompt_roles, animation_duration } from "../../../../script.js";
import { world_names, world_info, checkWorldInfo } from "../../../world-info.js";
import { getTokenCountAsync } from '../../../tokenizers.js';
import { loadMovingUIState } from "../../../power-user.js";
import { dragElement } from "../../../RossAscends-mods.js";

const extensionName = "Director";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

if (!extension_settings[extensionName]) {
  extension_settings[extensionName] = {};
}

if (!extension_settings[extensionName].chat) {
  extension_settings[extensionName].chat = {};
}

const extensionSettings = extension_settings[extensionName];

let clothesLorebook_names;
let clothesLorebookData;
let undiesLorebookData;
let hairLorebook_names;
let hairLorebookData;
let makeupLorebookData;
let locationsLorebookData;
let moodEntryId;
let moodEntryName;
let promptPreview = "";
let worldLorebookData;
let sectionStates = {};

async function initializeEventListeners(targetElement = '#extensions_settings') {
  const chatId = getContext().chatId;
  if (!extensionSettings.chat[chatId]) {
    extensionSettings.chat[chatId] = {};
    saveSettingsDebounced(); // Save the new object
  }

  $(targetElement).on('change', '.director-extension_block select, .director-extension_block input[type="number"], #notes, #chat_position_before, #chat_position_after, #chat_position_depth, #chat_depth, #chat_role', handleInputChange);

  $(targetElement).on('click', '.collapsible input[type="submit"]', toggleCollapsible);

  $(targetElement).on('click', '#extension_enabled', saveExtensionEnabledState);

  $(targetElement).on('change', '#worldLorebook', function() {
    updateWorldDropdowns();
  });

  $(targetElement).on('click', '#directorExtensionPopoutButton', function (e) {
    doPopout(e);
    e.stopPropagation();
  });

  // Ensure the Notes input event listener is attached
  $(targetElement).on('input', '#notes', onNotesInput);
}

function loadExtensionEnabledState() {
  const chatId = getContext().chatId;
  const isEnabled = extensionSettings.chat[chatId]?.isEnabled ?? true;
  $("#extension_enabled").prop("checked", isEnabled);
}

function loadSectionStates() {
    const savedStates = localStorage.getItem('sectionStates');
    if (savedStates) {
        try {
            sectionStates = JSON.parse(savedStates);
            for (const [id, isVisible] of Object.entries(sectionStates)) {
                if (id && typeof id === 'string' && id.indexOf('#') !== 0) {
                    if (isVisible) {
                        $('#' + id).show();
                    } else {
                        $('#' + id).hide();
                    }
                }
            }
        } catch (error) {
            // Do nothing
        }
    } else {
        $('.content').hide();
    }
}

async function loadSettings() {
  const chatId = getContext().chatId;

  if (!extensionSettings.chat[chatId]) {
    extensionSettings.chat[chatId] = {
      clothesLorebook: "Disabled",
      undiesLorebook: "Disabled",
      hairLorebook: "Disabled",
      makeupLorebook: "Disabled",
      locationsLorebook: "Disabled",
      userMood: "Disabled",
      charMood: "Disabled",
      worldLorebook: "Disabled",
      chatPosition: "1", // Default position in-chat @ depth
      chatDepth: 3, // Default depth
      chatRole: "0", // Default role System
    };
    saveSettingsDebounced(); // Save the new object
  }

  if (extensionSettings.chat[chatId].clothesLorebook !== "Disabled") {
    clothesLorebookData = await fetchLorebook(extensionSettings.chat[chatId].clothesLorebook);
  }

  if (extensionSettings.chat[chatId].undiesLorebook !== "Disabled") {
    undiesLorebookData = await fetchLorebook(extensionSettings.chat[chatId].undiesLorebook);
  }

  if (extensionSettings.chat[chatId].hairLorebook !== "Disabled") {
    hairLorebookData = await fetchLorebook(extensionSettings.chat[chatId].hairLorebook);
  }

  if (extensionSettings.chat[chatId].makeupLorebook !== "Disabled") {
    makeupLorebookData = await fetchLorebook(extensionSettings.chat[chatId].makeupLorebook);
  }

  if (extensionSettings.chat[chatId].locationsLorebook !== "Disabled") {
    locationsLorebookData = await fetchLorebook(extensionSettings.chat[chatId].locationsLorebook);
  }

  if (extensionSettings.chat[chatId].worldLorebook !== "Disabled") {
    worldLorebookData = await fetchLorebook(extensionSettings.chat[chatId].worldLorebook);
  }

  loadNotes();

  updateWorldInfoList();

  populateClothesDropdowns();
  populateUndiesDropdowns();
  populateHairDropdowns();
  populateMakeupDropdowns();
  populateLocationsDropdown();
  updateWorldDropdowns(); // Updated to call the new function

  loadExtensionEnabledState();
  updateTitleColor();

  loadChatSettings(); // Load chat settings
  updatePrompt();
}

function loadChatSettings() {
  const chatId = getContext().chatId;
  loadSetting('chatPosition', "1", 'chat_position');
  loadSetting('chatDepth', 1, 'chat_depth');
  loadSetting('chatRole', "0", 'chat_role');

  // Initialize radio buttons
  const chatPosition = extensionSettings.chat[chatId].chatPosition || "1";
  $('#chat_position_before').prop('checked', chatPosition === "0");
  $('#chat_position_after').prop('checked', chatPosition === "2");
  $('#chat_position_depth').prop('checked', chatPosition === "1");

  // Ensure one of the radio buttons is checked if none are set
  if (!$('#chat_position_before').is(':checked') && !$('#chat_position_after').is(':checked') && !$('#chat_position_depth').is(':checked')) {
    $('#chat_position_depth').prop('checked', true);
  }
}

async function handleInputChange(event) {
  const element = event.target;
  const chatId = getContext().chatId;

  if (!extensionSettings.chat[chatId]) {
    extensionSettings.chat[chatId] = {};
    saveSettingsDebounced(); // Save the new object
  }

  const value = element.value;

  switch (element.id) {
    case 'notes':
      onNotesInput();
      return; // we don't want to save this one here
    case 'chat_position_before':
      extensionSettings.chat[chatId].chatPosition = "2";
      break;
    case 'chat_position_after':
      extensionSettings.chat[chatId].chatPosition = "0";
      break;
    case 'chat_position_depth':
      extensionSettings.chat[chatId].chatPosition = "1";
      break;
    case 'chat_depth':
      extensionSettings.chat[chatId].chatDepth = Number(value);
      break;
    case 'chat_role':
      extensionSettings.chat[chatId].chatRole = value;
      break;
    default:
      let settingName;
      switch (element.id) {
        case 'clothesLorebook':
        case 'undiesLorebook':
        case 'hairLorebook':
        case 'makeupLorebook':
        case 'locationsLorebook':
        case 'worldLorebook':
          await updateLorebooks(element.id, value);
          break;
        default:
          if (element.id.includes('Clothes') || element.id.includes('Undies') || element.id.includes('Hair') || element.id.includes('Makeup')) {
            settingName = element.id; // Use the id as the setting name
          } else {
            settingName = element.id; // Handle dynamically generated IDs
          }
      }
      if (settingName) {
        extensionSettings.chat[chatId][settingName] = value;
      }
  }

  saveSettingsDebounced();
  updatePrompt(); // Update the prompt and token counter
}

function toggleCollapsible(event) {
  const targetId = $(event.target).closest('.collapsible').data('target');
  if ($(event.target).is('#extension_enabled')) {
    return; // Don't toggle if the event target is the checkbox
  }
  $('#' + targetId).slideToggle(function() {
    sectionStates[targetId] = $(this).is(":visible");
    localStorage.setItem('sectionStates', JSON.stringify(sectionStates));
  });
  event.stopPropagation();
}

async function fetchLorebook(lorebook) {
  if (!lorebook || lorebook === "Disabled") return { entries: {} }; // Return an empty object with entries if lorebook is undefined or "Disabled"

  const response = await fetch('/api/worldinfo/get', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ name: lorebook }), // Use lorebook directly
    cache: 'no-cache',
  });

  if (response.ok) {
    const data = await response.json();
    return data && data.entries ? data : { entries: {} }; // Ensure data has an entries property
  } else {
    console.error("Failed to fetch lorebook:", response.statusText);
    return { entries: {} }; // Return an empty object with entries if fetch fails
  }
}

async function fetchClothesLorebook(lorebook) {
  if (!lorebook || lorebook === "Disabled") return null; // Return null if lorebook is undefined or "Disabled"

  const response = await fetch('/api/worldinfo/get', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ name: lorebook }), // Use lorebook directly
    cache: 'no-cache',
  });
  if (response.ok) {
    return await response.json();
  } else {
    console.error("Failed to fetch clothesLorebook:", response.statusText);
    return null;
  }
}

async function updateWorldInfoList() {
    const lorebooks = world_names;

    // Populate clothesLorebook dropdown
    $('#clothesLorebook').empty().append('<option value="Disabled">Disabled</option>');
    $('#undiesLorebook').empty().append('<option value="Disabled">Disabled</option>');
    $('#hairLorebook').empty().append('<option value="Disabled">Disabled</option>');
    $('#makeupLorebook').empty().append('<option value="Disabled">Disabled</option>');
    $('#locationsLorebook').empty().append('<option value="Disabled">Disabled</option>');
    $('#worldLorebook').empty().append('<option value="Disabled">Disabled</option>');

    lorebooks.forEach((item, i) => {
        $('#clothesLorebook').append(`<option value='${item}'>${item}</option>`);
        $('#undiesLorebook').append(`<option value='${item}'>${item}</option>`);
        $('#hairLorebook').append(`<option value='${item}'>${item}</option>`);
        $('#makeupLorebook').append(`<option value='${item}'>${item}</option>`);
        $('#locationsLorebook').append(`<option value='${item}'>${item}</option>`);
        $('#worldLorebook').append(`<option value='${item}'>${item}</option>`);
    });

    const chatId = getContext().chatId;
    loadSetting('clothesLorebook', "Disabled", 'clothesLorebook');
    loadSetting('undiesLorebook', "Disabled", 'undiesLorebook');
    loadSetting('hairLorebook', "Disabled", 'hairLorebook');
    loadSetting('makeupLorebook', "Disabled", 'makeupLorebook');
    loadSetting('locationsLorebook', "Disabled", 'locationsLorebook');
    loadSetting('worldLorebook', "Disabled", 'worldLorebook');
}

async function updateLorebooks(lorebookType, val) {
  const chatId = getContext().chatId;

  switch (lorebookType) {
    case 'clothesLorebook':
      extensionSettings.chat[chatId].clothesLorebook = val;
      clothesLorebookData = await fetchLorebook(val);
      populateClothesDropdowns();
      break;
    case 'undiesLorebook':
      extensionSettings.chat[chatId].undiesLorebook = val;
      undiesLorebookData = await fetchLorebook(val);
      populateUndiesDropdowns();
      break;
    case 'hairLorebook':
      extensionSettings.chat[chatId].hairLorebook = val;
      hairLorebookData = await fetchLorebook(val);
      populateHairDropdowns();
      break;
    case 'makeupLorebook':
      extensionSettings.chat[chatId].makeupLorebook = val;
      makeupLorebookData = await fetchLorebook(val);
      populateMakeupDropdowns();
      break;
    case 'locationsLorebook':
      extensionSettings.chat[chatId].locationsLorebook = val;
      locationsLorebookData = await fetchLorebook(val);
      populateLocationsDropdown();
      break;
    case 'worldLorebook':
      extensionSettings.chat[chatId].worldLorebook = val;
      worldLorebookData = await fetchLorebook(val);
      updateWorldDropdowns(); // Added to update the world dropdowns when worldLorebook changes
      break;
  }
  saveSettingsDebounced(); // Save the settings after updating the lorebook data
}

function updateWorldDropdowns() {
    const chatId = getContext().chatId;
    const worldSelectContainer = $('#world_settings_table');
    const selectedworldLorebook = extensionSettings.chat[chatId]?.worldLorebook ?? "Disabled";

    // Remove existing world settings rows
    worldSelectContainer.find('tr.world-setting').remove();

    // Remove existing mood rows
    $('#user_settings_container table tr:contains("Mood")').remove();
    $('#char_settings_container table tr:contains("Mood")').remove();

    moodEntryId = null;
    moodEntryName = null;

    if (selectedworldLorebook !== "Disabled" && worldLorebookData && worldLorebookData.entries) {
        for (const entryId in worldLorebookData.entries) {
            const entryName = worldLorebookData.entries[entryId].comment;
            const optionText = worldLorebookData.entries[entryId].content;

            if (entryName.toLowerCase().includes("mood")) {
                moodEntryId = entryId;
                moodEntryName = entryName;
                continue; // Skip adding Mood to the world settings container
            }

            const row = $('<tr class="world-setting"></tr>');
            const labelCell = $('<td></td>').text(entryName);
            const selectCell = $('<td></td>');

            const select = $('<select style="width: 200px;"></select>'); // Set the width here
            select.append($('<option></option>').attr('value', 'Disabled').text('Disabled'));
            optionText.split(',').forEach(option => {
                select.append($('<option></option>').attr('value', option.trim()).text(option.trim()));
            });

            selectCell.append(select);
            row.append(labelCell).append(selectCell);
            worldSelectContainer.append(row);
        }
    }

    loadworldSettings();

    if (moodEntryId) {
        const userTable = $('#user_settings_container table');
        const charTable = $('#char_settings_container table');

        const moodRow = $('<tr></tr>');
        const labelCell = $('<td></td>').text('Mood');
        const selectCell = $('<td></td>');

        const userMoodSelect = $('<select id="userMood" style="width: 200px;"></select>'); // Set the width here
        const charMoodSelect = $('<select id="charMood" style="width: 200px;"></select>'); // Set the width here

        userMoodSelect.append($('<option></option>').attr('value', 'Disabled').text('Disabled'));
        charMoodSelect.append($('<option></option>').attr('value', 'Disabled').text('Disabled'));

        const moodOptions = worldLorebookData.entries[moodEntryId].content.split(',');
        moodOptions.forEach(option => {
            userMoodSelect.append($('<option></option>').attr('value', option.trim()).text(option.trim()));
            charMoodSelect.append($('<option></option>').attr('value', option.trim()).text(option.trim()));
        });

        selectCell.append(userMoodSelect);
        moodRow.append(labelCell).append(selectCell);
        userTable.append(moodRow);

        const charMoodRow = $('<tr></tr>');
        const charLabelCell = $('<td></td>').text('Mood');
        const charSelectCell = $('<td></td>');
        charSelectCell.append(charMoodSelect);
        charMoodRow.append(charLabelCell).append(charSelectCell);
        charTable.append(charMoodRow);

        // Load the saved Mood values
        loadSetting('userMood', "Disabled", 'userMood');
        loadSetting('charMood', "Disabled", 'charMood');

        // Update the event listeners to save the Mood values
        $('#userMood, #charMood').on('change', function() {
            const chatId = getContext().chatId;
            const settingName = $(this).attr('id');
            extensionSettings.chat[chatId][settingName] = $(this).val();
            saveSettingsDebounced();
            updatePrompt();
        });
    }
}

function loadworldSettings() {
  const chatId = getContext().chatId;
  const worldSettings = extensionSettings.chat[chatId]?.worldSettings ?? {};

  $('#world_settings_table').find('select').each(function() {
    const select = $(this);
    const entryName = select.closest('tr').find('td:first').text();
    const selectedValue = worldSettings[entryName];

    if (selectedValue) {
      select.val(selectedValue);
    } else {
      select.val('Disabled'); // Default to 'Disabled' if not found
    }

    select.on('change', function() {
      const chatId = getContext().chatId;
      const worldSettings = extensionSettings.chat[chatId]?.worldSettings ?? {};
      worldSettings[entryName] = select.val();

      extensionSettings.chat[chatId].worldSettings = worldSettings;
      saveSettingsDebounced();

      updatePrompt();
    });
  });
}

function sortDropdownOptions() {
  const selectedValues = {
    userClothes: $("#userClothes").val(),
    charClothes: $("#charClothes").val(),
    userUndies: $("#userUndies").val(),
    charUndies: $("#charUndies").val(),
    userHair: $("#userHair").val(),
    charHair: $("#charHair").val(),
    userMakeup: $("#userMakeup").val(),
    charMakeup: $("#charMakeup").val(),
    location: $("#location").val(),
  };

  sortDropdownAlphabetically("#userClothes");
  sortDropdownAlphabetically("#charClothes");
  sortDropdownAlphabetically("#userUndies");
  sortDropdownAlphabetically("#charUndies");
  sortDropdownAlphabetically("#userHair");
  sortDropdownAlphabetically("#charHair");
  sortDropdownAlphabetically("#userMakeup");
  sortDropdownAlphabetically("#charMakeup");
  sortDropdownAlphabetically("#location");

  $("#userClothes").val(selectedValues.userClothes);
  $("#charClothes").val(selectedValues.charClothes);
  $("#userUndies").val(selectedValues.userUndies);
  $("#charUndies").val(selectedValues.charUndies);
  $("#userHair").val(selectedValues.userHair);
  $("#charHair").val(selectedValues.charHair);
  $("#userMakeup").val(selectedValues.userMakeup);
  $("#charMakeup").val(selectedValues.charMakeup);
  $("#location").val(selectedValues.location);
}

function sortDropdownAlphabetically(selector) {
  $(selector).html($(selector + " option").sort(function(a, b) {
    return a.value == "Disabled" ? -1 : b.value == "Disabled" ? 1 : a.text.localeCompare(b.text);
  }));
}

async function populateClothesDropdowns() {
    const userClothesSelect = $('#userClothes');
    const charClothesSelect = $('#charClothes');
    userClothesSelect.empty().append('<option value="Disabled">Disabled</option>');
    charClothesSelect.empty().append('<option value="Disabled">Disabled</option>');

    if (clothesLorebookData) {
        for (const entryId in clothesLorebookData.entries) {
            const entryName = clothesLorebookData.entries[entryId].comment;
            const option = $('<option></option>').attr('value', entryId).text(entryName);
            userClothesSelect.append(option.clone());
            charClothesSelect.append(option);
        }
    }

    loadSetting('userClothes', "Disabled", 'userClothes');
    loadSetting('charClothes', "Disabled", 'charClothes');

    // Set the width for dropdown boxes
    userClothesSelect.attr('style', 'width: 200px;');
    charClothesSelect.attr('style', 'width: 200px;');

    sortDropdownOptions();
}

async function populateUndiesDropdowns() {
  const userUndiesSelect = $('#userUndies');
  const charUndiesSelect = $('#charUndies');
  userUndiesSelect.empty().append('<option value="Disabled">Disabled</option>');
  charUndiesSelect.empty().append('<option value="Disabled">Disabled</option>');

  if (undiesLorebookData) {
    for (const entryId in undiesLorebookData.entries) {
      const entryName = undiesLorebookData.entries[entryId].comment;
      const option = $('<option></option>').attr('value', entryId).text(entryName);
      userUndiesSelect.append(option.clone());
      charUndiesSelect.append(option);
    }
  }

  loadSetting('userUndies', "Disabled", 'userUndies');
  loadSetting('charUndies', "Disabled", 'charUndies');
  sortDropdownOptions();
}

async function populateHairDropdowns() {
  const userHairSelect = $('#userHair');
  const charHairSelect = $('#charHair');
  userHairSelect.empty().append('<option value="Disabled">Disabled</option>');
  charHairSelect.empty().append('<option value="Disabled">Disabled</option>');

  if (hairLorebookData) {
    for (const entryId in hairLorebookData.entries) {
      const entryName = hairLorebookData.entries[entryId].comment;
      const option = $('<option></option>').attr('value', entryId).text(entryName);
      userHairSelect.append(option.clone());
      charHairSelect.append(option);
    }
  }

  loadSetting('userHair', "Disabled", 'userHair');
  loadSetting('charHair', "Disabled", 'charHair');
  sortDropdownOptions();
}

async function populateMakeupDropdowns() {
  const userMakeupSelect = $('#userMakeup');
  const charMakeupSelect = $('#charMakeup');
  userMakeupSelect.empty().append('<option value="Disabled">Disabled</option>');
  charMakeupSelect.empty().append('<option value="Disabled">Disabled</option>');

  if (makeupLorebookData) {
    for (const entryId in makeupLorebookData.entries) {
      const entryName = makeupLorebookData.entries[entryId].comment;
      const option = $('<option></option>').attr('value', entryId).text(entryName);
      userMakeupSelect.append(option.clone());
      charMakeupSelect.append(option);
    }
  }

  loadSetting('userMakeup', "Disabled", 'userMakeup');
  loadSetting('charMakeup', "Disabled", 'charMakeup');
  sortDropdownOptions();
}

function populateLocationsDropdown() {
  const locationSelect = $('#location');
  locationSelect.empty().append('<option value="Disabled">Disabled</option>');

  if (locationsLorebookData) {
    for (const entryId in locationsLorebookData.entries) {
      const entryName = locationsLorebookData.entries[entryId].comment;
      const option = $('<option></option>').attr('value', entryId).text(entryName);
      locationSelect.append(option);
    }
  }

  loadSetting('location', "Disabled", 'location');
  sortDropdownOptions();
}

async function onNotesInput() {
  const chatId = getContext().chatId;
  extensionSettings.chat[chatId].notes = event.target.value;
  saveSettingsDebounced();
  updatePrompt();
}

function loadSetting(key, defaultVal, elementId) {
  const chatId = getContext().chatId;
  $(`#${elementId}`).val(extensionSettings.chat[chatId]?.[key] ?? defaultVal);
}

function loadNotes() {
  const chatId = getContext().chatId;
  const notes = extensionSettings.chat[chatId]?.notes ?? "";
  $("#notes").val(notes);
}

function savePromptPreview() {
  const chatId = getContext().chatId;
  extensionSettings.chat[chatId].promptPreview = $("#promptPreview").val();
  saveSettingsDebounced();
}

function loadPromptPreview() {
  const chatId = getContext().chatId;
  const promptPreview = extensionSettings.chat[chatId]?.promptPreview ?? "";
  $("#promptPreview").val(promptPreview);
}

async function updateTokenCounter() {
    const promptPreviewText = $('#promptPreview').val();
    const tokenCount = await getTokenCountAsync(promptPreviewText);
    $('#prompt_preview_token_counter').text(`Tokens: ${tokenCount}`);
}

function updateTitleColor() {
  const drawerTextElement = $('b:contains("Director")');
  if ($('#extension_enabled').is(':checked')) {
    drawerTextElement.css('color', 'green');
  } else {
    drawerTextElement.css('color', '');
  }
}

async function saveExtensionEnabledState() {
  const chatId = getContext().chatId;
  extensionSettings.chat[chatId].isEnabled = $("#extension_enabled").is(":checked");
  saveSettingsDebounced();
  updateTitleColor();

  if (!extensionSettings.chat[chatId].isEnabled) {
    getContext().setExtensionPrompt(extensionName, '');
  } else {
    updatePrompt();
  }
}

async function loadLocation() {
  loadSetting('location', "Disabled", 'location');
}

async function loadUserClothes() {
  loadSetting('userClothes', "Disabled", 'userClothes');
}
async function loadCharClothes() {
  loadSetting('charClothes', "Disabled", 'charClothes');
}
async function loadUserUndies() {
  loadSetting('userUndies', "Disabled", 'userUndies');
}
async function loadCharUndies() {
  loadSetting('charUndies', "Disabled", 'charUndies');
}
async function loadUserHair() { 
  loadSetting('userHair', "Disabled", 'userHair');
}
async function loadCharHair() {
  loadSetting('charHair', "Disabled", 'charHair');
}
async function loadUserMakeup() {
  loadSetting('userMakeup', "Disabled", 'userMakeup');
}
async function loadCharMakeup() {
  loadSetting('charMakeup', "Disabled", 'charMakeup');
}

async function updatePrompt() {
  const chatId = getContext().chatId;
  const isEnabled = extensionSettings.chat[chatId]?.isEnabled ?? true;
  const chatSettings = extensionSettings.chat[chatId] || {};
  const notes = chatSettings.notes ?? "";

  if (!isEnabled) {
    getContext().setExtensionPrompt(extensionName, '');
    return;
  }

  let prompt = ""; // Initialize without the header

  // User's clothing
  const userClothes = chatSettings.userClothes ?? "Disabled";
  if (userClothes !== "Disabled" && clothesLorebookData && clothesLorebookData.entries[userClothes]) {
    const selectedEntry = clothesLorebookData.entries[userClothes];
    prompt += `{{user}}'s clothing is ${selectedEntry.content}\n`;
  }

  // User's underwear
  const userUndies = chatSettings.userUndies ?? "Disabled";
  if (userUndies !== "Disabled" && undiesLorebookData && undiesLorebookData.entries[userUndies]) {
    const selectedEntry = undiesLorebookData.entries[userUndies];
    prompt += `{{user}}'s underwear is ${selectedEntry.content}\n`;
  }

  // User's hair
  const userHair = chatSettings.userHair ?? "Disabled";
  if (userHair !== "Disabled" && hairLorebookData && hairLorebookData.entries[userHair]) {
    const selectedEntry = hairLorebookData.entries[userHair];
    prompt += `{{user}}'s hair is ${selectedEntry.content}\n`;
  }

  // User's makeup
  const userMakeup = chatSettings.userMakeup ?? "Disabled";
  if (userMakeup !== "Disabled" && makeupLorebookData && makeupLorebookData.entries[userMakeup]) {
    const selectedEntry = makeupLorebookData.entries[userMakeup];
    prompt += `{{user}}'s makeup is ${selectedEntry.content}\n`;
  }

  // User's mood
  const userMood = chatSettings.userMood ?? "Disabled";
  if (userMood !== "Disabled" && moodEntryId && worldLorebookData && worldLorebookData.entries[moodEntryId]) {
    prompt += `{{user}}'s mood is ${userMerod.toLowerCase()}\n`;
  }

  // Char's clothing
  const charClothes = chatSettings.charClothes ?? "Disabled";
  if (charClothes !== "Disabled" && clothesLorebookData && clothesLorebookData.entries[charClothes]) {
    const selectedEntry = clothesLorebookData.entries[charClothes];
    prompt += `{{char}}'s clothing is ${selectedEntry.content}\n`;
  }

  // Char's underwear
  const charUndies = chatSettings.charUndies ?? "Disabled";
  if (charUndies !== "Disabled" && undiesLorebookData && undiesLorebookData.entries[charUndies]) {
    const selectedEntry = undiesLorebookData.entries[charUndies];
    prompt += `{{char}}'s underwear is ${selectedEntry.content}\n`;
  }

  // Char's hair
  const charHair = chatSettings.charHair ?? "Disabled";
  if (charHair !== "Disabled" && hairLorebookData && hairLorebookData.entries[charHair]) {
    const selectedEntry = hairLorebookData.entries[charHair];
    prompt += `{{char}}'s hair is ${selectedEntry.content}\n`;
  }

  // Char's makeup
  const charMakeup = chatSettings.charMakeup ?? "Disabled";
  if (charMakeup !== "Disabled" && makeupLorebookData && makeupLorebookData.entries[charMakeup]) {
    const selectedEntry = makeupLorebookData.entries[charMakeup];
    prompt += `{{char}}'s makeup is ${selectedEntry.content}\n`;
  }

  // Char's mood
  const charMood = chatSettings.charMood ?? "Disabled";
  if (charMood !== "Disabled" && moodEntryId && worldLorebookData && worldLorebookData.entries[moodEntryId]) {
    prompt += `{{char}}'s mood is ${charMood.toLowerCase()}.\n`;
  }

  // Location
  const location = chatSettings.location ?? "Disabled";
  if (location !== "Disabled" && locationsLorebookData && locationsLorebookData.entries[location]) {
    const selectedEntry = locationsLorebookData.entries[location];
    prompt += `The location is ${selectedEntry.content}\n`;
  }

  // Handle world Settings
  $('#world_settings_table').find('select').each(function() { 
    const select = $(this);
    const entryName = select.closest('tr').find('td:first').text(); // Get the text of the first TD in the same TR

    // Skip the location if it's already been handled
    if (entryName === 'Location') return;

    const selectedValue = select.val();

    // Check if the selected value is not null and not "Disabled"
    if (selectedValue !== null && selectedValue !== "Disabled") {
      prompt += `The ${entryName.toLowerCase()} is ${selectedValue.toLowerCase()}.\n`;
    }
  });

  if (prompt.trim() !== "") {
    prompt = "Scene information:\n" + prompt;
  }

  if (notes.trim() !== "") {
    prompt = prompt === "" ? `Scene notes: ${notes}` : `${prompt}\nScene notes: ${notes}`;
  }

  promptPreview = prompt;

  $("#promptPreview").val(promptPreview);

  const chatPosition = Number(chatSettings.chatPosition) || 1;
  const chatDepth = Number(chatSettings.chatDepth) || 1;
  const chatRole = Number(chatSettings.chatRole) || extension_prompt_roles.SYSTEM;

  getContext().setExtensionPrompt(extensionName, prompt.trim(), chatPosition, chatDepth, false, chatRole);

  await updateTokenCounter();
}

async function doPopout(e) {
    const target = e.target;
    // repurposes the zoomed avatar template to serve as a floating div
    if ($('#directorExtensionPopout').length === 0) {
        const originalHTMLClone = $(target).parent().parent().parent().find('.inline-drawer-content').html();
        const originalElement = $(target).parent().parent().parent().find('.inline-drawer-content');
        const template = $('#zoomed_avatar_template').html();
        const newElement = $(template);
        newElement.attr('id', 'directorExtensionPopout')
            .removeClass('zoomed_avatar')
            .addClass('draggable')
            .empty();

        // Create the header for the pop-out window
        const headerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center;">
                    <input type="checkbox" id="popout_extension_enabled" class="menu_checkbox" />
                    <span id="popout_director_label" style="font-weight: bold; color: ${$('#extension_enabled').is(':checked') ? 'green' : ''}; margin-left: 5px;">Director</span>
                </div>
                <div>
                    <div class="fa-solid fa-grip drag-grabber hoverglow" style="margin-right: 10px;"></div>
                    <div id="directorExtensionPopoutClose" class="fa-solid fa-circle-xmark hoverglow dragClose"></div>
                </div>
            </div>
        `;

        newElement.append(headerHTML).append(`<div id="popout-content" class="scrollable-content">${originalHTMLClone}</div>`);
        $('body').append(newElement);
        $('#directorExtensionDrawerContents').addClass('scrollableInnerFull');

        const prevSummaryBoxContents = $('#extension_enabled').prop('checked'); // copy summary box before emptying
        originalElement.empty();
        originalElement.html('<div class="flex-container alignitemscenter justifyCenter wide100p"><small>Currently popped out</small></div>');
        $('#popout_extension_enabled').prop('checked', prevSummaryBoxContents); // paste prev summary box contents into popout box

        setupListeners();  // Reinitialize event listeners here
        loadSettings();
        loadMovingUIState();

        // Make the content area scrollable
        $('#popout-content').css({
            'overflow-y': 'auto',
            'max-height': '80vh', // Adjust the max-height as needed
            'padding': '10px', // Optional: Add some padding
            'box-sizing': 'border-box' // Ensure padding is included in the height
        });

        // Set a fixed width for all dropdown boxes
        $('#directorExtensionPopout select').each(function() {
            $(this).attr('style', 'width: 200px;'); // Set your desired fixed width here
        });

        $('#directorExtensionPopout').fadeIn(animation_duration);
        dragElement(newElement);

        // setup listener for close button to restore extensions menu
        $('#directorExtensionPopoutClose').off('click').on('click', function () {
            $('#directorExtensionDrawerContents').removeClass('scrollableInnerFull');
            const summaryPopoutHTML = $('#directorExtensionDrawerContents');
            $('#directorExtensionPopout').fadeOut(animation_duration, () => {
                originalElement.empty();
                originalElement.html(summaryPopoutHTML);
                $('#directorExtensionPopout').remove();
            });
            loadSettings();
        });

        // Synchronize the popout checkbox with the main checkbox
        $('#popout_extension_enabled').on('click', function() {
            const isChecked = $(this).is(':checked');
            $('#extension_enabled').prop('checked', isChecked);
            $('#popout_director_label').css('color', isChecked ? 'green' : '');
            saveExtensionEnabledState();
        });

        // Ensure the main checkbox is synchronized with the popout checkbox
        $('#extension_enabled').on('click', function() {
            const isChecked = $(this).is(':checked');
            $('#popout_extension_enabled').prop('checked', isChecked);
            $('#popout_director_label').css('color', isChecked ? 'green' : '');
        });

        // Ensure the label is not clickable to toggle the checkbox
        $('#popout_director_label').off('click').on('click', function(e) {
            e.stopPropagation();
        });

    } else {
        $('#directorExtensionPopout').fadeOut(animation_duration, () => { $('#directorExtensionPopoutClose').trigger('click'); });
    }
}

function setupListeners() {
    $('#directorExtensionPopoutButton').off('click').on('click', function (e) {
        doPopout(e);
        e.stopPropagation();
    });
    initializeEventListeners('#directorExtensionPopout'); // Reinitialize for popout
}

jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/index.html`);
  $("#extensions_settings").append(settingsHtml);
  $('#extension_enabled').on('click', function(event) {
    saveExtensionEnabledState();
    event.stopPropagation();
  });

  initializeEventListeners();
  
  $('#notes').on('input', onNotesInput);

  loadSettings();
  loadSectionStates();
  loadPromptPreview();

  eventSource.on(event_types.WORLDINFO_UPDATED, async (newData) => {
    const chatId = getContext().chatId;
    let selectedUserClothes = extensionSettings.chat[chatId]?.userClothes ?? "Disabled";
    let selectedCharClothes = extensionSettings.chat[chatId]?.charClothes ?? "Disabled";
    let selectedUserUndies = extensionSettings.chat[chatId]?.userUndies ?? "Disabled";
    let selectedCharUndies = extensionSettings.chat[chatId]?.charUndies ?? "Disabled";
    let selectedUserHair = extensionSettings.chat[chatId]?.userHair ?? "Disabled";
    let selectedCharHair = extensionSettings.chat[chatId]?.charHair ?? "Disabled";
    let selectedUserMakeup = extensionSettings.chat[chatId]?.userMakeup ?? "Disabled";
    let selectedCharMakeup = extensionSettings.chat[chatId]?.charMakeup ?? "Disabled";
    let selectedLocation = extensionSettings.chat[chatId]?.location ?? "Disabled";

    const clothesLorebook = extensionSettings.chat[chatId]?.clothesLorebook ?? "Disabled";
    const undiesLorebook = extensionSettings.chat[chatId]?.undiesLorebook ?? "Disabled";
    const hairLorebook = extensionSettings.chat[chatId]?.hairLorebook ?? "Disabled";
    const makeupLorebook = extensionSettings.chat[chatId]?.makeupLorebook ?? "Disabled";
    const locationsLorebook = extensionSettings.chat[chatId]?.locationsLorebook ?? "Disabled";
    const worldLorebook = extensionSettings.chat[chatId]?.worldLorebook ?? "Disabled";

    if (clothesLorebook !== "Disabled") {
      clothesLorebookData = await fetchClothesLorebook(clothesLorebook);
      if (!clothesLorebookData.entries[selectedUserClothes]) {
        selectedUserClothes = "Disabled";
      }
      if (!clothesLorebookData.entries[selectedCharClothes]) {
        selectedCharClothes = "Disabled";
      }
      populateClothesDropdowns();
      sortDropdownOptions();
      $("#userClothes").val(selectedUserClothes);
      $("#charClothes").val(selectedCharClothes);
    }

    if (undiesLorebook !== "Disabled") {
      undiesLorebookData = await fetchClothesLorebook(undiesLorebook);
      if (!undiesLorebookData.entries[selectedUserUndies]) {
        selectedUserUndies = "Disabled";
      }
      if (!undiesLorebookData.entries[selectedCharUndies]) {
        selectedCharUndies = "Disabled";
      }
      populateUndiesDropdowns();
      sortDropdownOptions();
      $("#userUndies").val(selectedUserUndies);
      $("#charUndies").val(selectedCharUndies);
    }

    if (hairLorebook !== "Disabled") {
      hairLorebookData = await fetchClothesLorebook(hairLorebook);
      if (!hairLorebookData.entries[selectedUserHair]) {
        selectedUserHair = "Disabled";
      }
      if (!hairLorebookData.entries[selectedCharHair]) {
        selectedCharHair = "Disabled";
      }
      populateHairDropdowns();
      sortDropdownOptions();
      $("#userHair").val(selectedUserHair);
      $("#charHair").val(selectedCharHair);
    }

    if (makeupLorebook !== "Disabled") {
      makeupLorebookData = await fetchClothesLorebook(makeupLorebook);
      if (!makeupLorebookData.entries[selectedUserMakeup]) {
        selectedUserMakeup = "Disabled";
      }
      if (!makeupLorebookData.entries[selectedCharMakeup]) {
        selectedCharMakeup = "Disabled";
      }
      populateMakeupDropdowns();
      sortDropdownOptions();
      $("#userMakeup").val(selectedUserMakeup);
      $("#charMakeup").val(selectedCharMakeup);
    }

    if (locationsLorebook !== "Disabled") {
      locationsLorebookData = await fetchClothesLorebook(locationsLorebook);
      if (!locationsLorebookData.entries[selectedLocation]) {
        selectedLocation = "Disabled";
      }
      populateLocationsDropdown();
      sortDropdownOptions();
      $("#location").val(selectedLocation);
    }

    if (worldLorebook !== "Disabled") {
      const newworldLorebookData = await fetchLorebook(worldLorebook);
      if (JSON.stringify(newworldLorebookData) !== JSON.stringify(worldLorebookData)) {
        worldLorebookData = newworldLorebookData;
        updateWorldDropdowns(); // Updated to call the new function
      }
    }

    updatePrompt();
  });

  eventSource.on(event_types.CHAT_CHANGED, loadSettings);
});