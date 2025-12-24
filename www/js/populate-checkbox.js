function populateCheckboxes(
  lte_band,
  nsa_nr5g_band,
  nr5g_band,
  locked_lte_bands,
  locked_nsa_bands,
  locked_sa_bands,
  cellLock
) {
  var checkboxesForm = document.getElementById("checkboxForm");
  var networkModeElement = document.getElementById("networkModeBand");

  const dropdown = document.getElementById("networkModeBand");
  const mode = dropdown ? dropdown.value : "LTE";
  
  if (!checkboxesForm) return;

  checkboxesForm.classList.remove("lte-layout", "nr-layout");
  if (mode === "LTE") {
    checkboxesForm.classList.add("lte-layout");
  } else {
    checkboxesForm.classList.add("nr-layout");
  }

  if (!checkboxesForm || !networkModeElement) {
    console.warn(
      "Unable to populate the checkboxes: required elements are missing."
    );
    return;
  }

  var selectedMode = networkModeElement.value;
  var bands;
  var prefix;

  // Determine bands and prefix based on selected network mode
  if (selectedMode === "LTE") {
    bands = lte_band;
    prefix = "B";
  } else if (selectedMode === "NSA") {
    bands = nsa_nr5g_band;
    prefix = "N";
  } else if (selectedMode === "SA") {
    bands = nr5g_band;
    prefix = "N";
  }

  checkboxesForm.innerHTML = ""; // Clear existing checkboxes

  var safeSplit = function (value) {
    if (typeof value !== "string" || value.length === 0) {
      return [];
    }

    return value
      .split(":")
      .map(function (item) {
        return item.trim();
      })
      .filter(function (item) {
        return item.length > 0;
      });
  };

  // Store the locked bands in arrays
  var locked_lte_bands_array = safeSplit(locked_lte_bands);
  var locked_nsa_bands_array = safeSplit(locked_nsa_bands);
  var locked_sa_bands_array = safeSplit(locked_sa_bands);

  var isBandLocked = function(band) {
    if (selectedMode === "LTE" && locked_lte_bands_array.includes(band)) {
      return true;
    }
    if (selectedMode === "NSA" && locked_nsa_bands_array.includes(band)) {
      return true;
    }
    if (selectedMode === "SA" && locked_sa_bands_array.includes(band)) {
      return true;
    }
    return false;
  };

  if (typeof bands === "string" && bands.length > 0 && bands !== "0") {
    var bandsArray = safeSplit(bands);
    
    var container = document.createElement("div");
    container.className = "band-toggle-container";

    bandsArray.forEach(function (band) {
      var toggleDiv = document.createElement("div");
      toggleDiv.className = "band-toggle";
      
      var checkboxInput = document.createElement("input");
      checkboxInput.type = "checkbox";
      checkboxInput.id = "inlineCheckbox" + band;
      checkboxInput.value = band;
      checkboxInput.autocomplete = "off";
      checkboxInput.checked = isBandLocked(band);

      var label = document.createElement("label");
      label.className = "band-toggle-label";
      label.htmlFor = "inlineCheckbox" + band;
      label.textContent = prefix + band;

      toggleDiv.appendChild(checkboxInput);
      toggleDiv.appendChild(label);
      container.appendChild(toggleDiv);
    });

    checkboxesForm.appendChild(container);
  } else {
    // Create a text saying that no bands are available
    var noBandsText = document.createElement("p");
    noBandsText.className = "text-center";
    noBandsText.innerText = "No supported bands available";
    checkboxesForm.appendChild(noBandsText);
  }

  if (cellLock && typeof addCheckboxListeners === "function") {
    addCheckboxListeners(cellLock);
  }
}