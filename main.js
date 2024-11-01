// This code is not particularly nice. It is just meant to visualize the data.
// Collecting the data was the challenging part of this project.
// Functionality of the map:
// - Display vineyards as markers, switch to regions when zoomed out
// - Debounce the rendering of markers
// - Selecting a region, will zoom and only show the vineyards in that region
// - Search for vineyards and regions
// - Display grape varieties for some wineries

const map = L.map('map', {
    zoomControl: false,
    maxZoom: 18,
    minZoom: 3,
    maxBounds: [[70, 220], [-70, -180]],
    maxBoundsViscosity: 0.0001
}).setView([40, 20], 4);

const tileURL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const attributionText = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const reportFormURL = 'https://docs.google.com/forms/d/e/1FAIpQLSe7_vzqYRUW1_9c4T6fvoIiNX0DATkHjPp4JtY1BS07zIW6yA/viewform'

// Create a custom zoom control
const customZoomControl = L.Control.extend({
    options: {
        position: 'topleft' // This position is just a placeholder
    },
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'custom-zoom-control leaflet-bar');
        container.innerHTML = `
            <a class="leaflet-control-zoom-in" href="#" title="Zoom in">+</a>
            <a class="leaflet-control-zoom-out" href="#" title="Zoom out">-</a>
        `;
        L.DomEvent.on(container.querySelector('.leaflet-control-zoom-in'), 'click', function(e) {
            L.DomEvent.stopPropagation(e);
            L.DomEvent.preventDefault(e);
            map.zoomIn();
        });
        L.DomEvent.on(container.querySelector('.leaflet-control-zoom-out'), 'click', function(e) {
            L.DomEvent.stopPropagation(e);
            L.DomEvent.preventDefault(e);
            map.zoomOut();
        });
        return container;
    }
});

// Add the custom zoom control to the map
map.addControl(new customZoomControl());

map.attributionControl.setPrefix("&copy; 2024 Winery Map. Cheers! 🍷<a href='https://github.com/oOo0oOo/winerymap'>Github</a>")
L.tileLayer(tileURL, { attribution: attributionText }).addTo(map);

const zoomThreshold = 8.5;
const unknownZoomThreshold = 6;
let vineyardMarkers = new Map();
const regionMarkers = new Map();
const markersLayer = L.layerGroup().addTo(map);

var currentRegion = ''; // Empty string for no current region

var grapeNames;
var grapeVarieties;
fetch("grape_names.json")
    .then(response => response.json())
    .then(data => {
        grapeNames = data.grape_names;
        grapeVarieties = data.varieties;

        console.log(`Loaded ${grapeVarieties.length} grape varieties`);
}).catch(error => console.error('Error fetching grape names:', error));


const createVineyardMarker = (vineyard, region, color) => {
    const latLng = [vineyard[0], vineyard[1]];
    let popupContent = `
        <span class="popup-title">${vineyard[2]}</span><br>
        ${vineyard[3] ? `<br><a href="${vineyard[3]}" target="_blank">${vineyard[3].replace(/(^\w+:|^)\/\//, '')}</a>&nbsp;↗️<br>` : ''}
        <br>Region: <a href="#" class="region-link" data-region="${region}">${region}</a>
    `;

    let markerColor = color;
    if (vineyard[4].length > 0) {
        const varietiesContent = getGrapeVarietiesContent(vineyard[4]);
        popupContent += varietiesContent.content;
        markerColor = 'black';
    }
    
    // Report bad data via google forms
    const reportLink = reportFormURL + `?usp=pp_url&entry.1287891387=${encodeURIComponent(vineyard[2])}`;
    popupContent += `<br><br><a class="report-link" href="${reportLink}" target="_blank">Report bad data</a>`;

    const icon = L.divIcon({
        className: 'custom-marker-icon',
        html: `<div class="custom-marker-icon" style="background-color:${color};border:solid 1px ${markerColor}"></div>`,
        iconSize: [24, 24]
    });
    return L.marker(latLng, { icon: icon, region: region }).bindPopup(popupContent);
};


const createRegionMarker = (region, latLng, color, vineyards) => {
    const popupContent = `
        <span class="popup-title">${region}</span><br><br>Number of vineyards: ${vineyards.length}<br><br>
        <a href="#" class="region-link" data-region="${region}">Highlight Region</a>
    `;

    const icon = L.divIcon({
        className: 'custom-marker-region',
        html: `<div class="custom-marker-region" style="background-color:${color}"></div>`,
        iconSize: [32, 32]
    });
    return L.marker(latLng, { icon: icon, region: region }).bindPopup(popupContent);
};


const getGrapeVarietiesContent = (varieties) => {
    let reds = [], whites = [], roses = [];
    varieties.forEach(vari => {
        const variety = grapeNames[vari];
        if (variety) {
            let name = variety[0];
            if (grapeVarieties[variety[1]][0] !== variety[0]) {
                name = `${variety[0]} (${grapeVarieties[variety[1]][0]})`;
            }
            const col = grapeVarieties[variety[1]][1];
            if (col === 0) reds.push(name);
            else if (col === 1) whites.push(name);
            else if (col === 2) roses.push(name);
        } else {
            console.log(`Variety not found: ${vari}`);
        }
    });

    let content = '';
    if (reds.length > 0) content += `<br><br>Red Grapes: ${reds.join(', ')}`;
    if (whites.length > 0) content += `<br><br>White Grapes: ${whites.join(', ')}`;
    if (roses.length > 0) content += `<br><br>Rosé Grapes: ${roses.join(', ')}`;

    return { content, markerColor: 'black' };
};


const renderMarkers = () => {
    const bounds = map.getBounds();
    const zoomLevel = map.getZoom();
    const newMarkers = new Map();
    const mapCenter = map.getCenter();
    const showingUnknown = zoomLevel > unknownZoomThreshold;
    const showingVineyards = zoomLevel > zoomThreshold;

    let markersToAdd = [];

    for (const region in data) {
        const isUnknown = region === "Unknown";
        const regionCenter = isUnknown ? [0, 0] : regionCenters[region];
        let regionVisible = isUnknown ? true: bounds.contains(regionCenter);

        if (showingVineyards || (isUnknown && showingUnknown)) {
            // Skip regions that are too far away
            if (!regionVisible) {
                const distance = mapCenter.distanceTo(regionCenter);
                if (distance > 300000) continue;
            }

            const { color, vineyards } = data[region];
            vineyards.forEach(vineyard => {
                const latLng = [vineyard[0], vineyard[1]];
                if (currentRegion === region || bounds.contains(latLng)) {
                    const markerKey = `${vineyard[0]},${vineyard[1]}`;
                    if (!vineyardMarkers.has(markerKey)) {
                        const marker = createVineyardMarker(vineyard, region, color);
                        markersToAdd.push(marker);
                        newMarkers.set(markerKey, marker);
                    } else {
                        newMarkers.set(markerKey, vineyardMarkers.get(markerKey));
                    }
                }
            });
        } else if (regionVisible && !isUnknown && !showingVineyards) {
            if (!regionMarkers.has(region)) {
                const { color, vineyards } = data[region];
                const marker = createRegionMarker(region, regionCenter, color, vineyards);
                markersToAdd.push(marker);
                regionMarkers.set(region, marker);
            }
        }
    }

    // Add new markers
    markersToAdd.forEach(marker => markersLayer.addLayer(marker));

    // Remove markers that are not in the new set
    vineyardMarkers.forEach((marker, key) => {
        if (!newMarkers.has(key)) markersLayer.removeLayer(marker);
    });

    // Remove region markers if zoomed in
    if (showingVineyards) {
        regionMarkers.forEach(marker => markersLayer.removeLayer(marker));
        regionMarkers.clear();
    }

    // Hide vineyard markers if a region is selected
    if (currentRegion !== "") {
        newMarkers.forEach(marker => {
            const markerRegion = marker.options.region;
            if (markerRegion !== currentRegion) {
                const markerElement = marker.getElement();
                if (markerElement) {
                    markerElement.classList.add('hidden-marker');
                }
            }
        });

        regionMarkers.forEach(marker => {
            const markerRegion = marker.options.region;
            if (markerRegion !== currentRegion) {
                const markerElement = marker.getElement();
                if (markerElement) {
                    markerElement.classList.add('hidden-marker');
                }
            }
        });
    }

    vineyardMarkers = newMarkers;
};


const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};


let regionCenters = {};
let data;
fetch('vineyards.json')
    .then(response => response.json())
    .then(dataRaw => {
        data = dataRaw;
        setupSearch();

        let numVineyards = 0;
        for (const region in data) {
            if (region !== "Unknown") {
                const vineyards = data[region].vineyards;
                const { lat, lon } = vineyards.reduce((center, vineyard) => ({
                    lat: center.lat + vineyard[0],
                    lon: center.lon + vineyard[1]
                }), { lat: 0, lon: 0 });
                regionCenters[region] = [lat / vineyards.length, lon / vineyards.length];
            }
            numVineyards += data[region].vineyards.length;
        }
        console.log(`Loaded ${numVineyards} vineyards in ${Object.keys(data).length} regions`);

        const debouncedRenderMarkers = debounce(renderMarkers, 30);
        map.on('moveend', debouncedRenderMarkers);
        map.on('zoomend', debouncedRenderMarkers);
        debouncedRenderMarkers();
}).catch(error => console.error('Error fetching vineyards:', error));


function toggleMarkers(markers, region, hide) {
    markers.forEach(marker => {
        const markerRegion = marker.options.region;
        const markerElement = marker.getElement();
        if (markerElement) {
            if (hide && markerRegion !== region) {
                markerElement.classList.add('hidden-marker');
            } else {
                markerElement.classList.remove('hidden-marker');
            }
        }
        // Close any open popups
        if (marker.getPopup()) {
            marker.closePopup();
        }
    });
}

function showAllMarkers() {
    vineyardMarkers.forEach(marker => {
        marker.getElement().classList.remove('hidden-marker');
    });

    regionMarkers.forEach(marker => {
        marker.getElement().classList.remove('hidden-marker');
    });
}


function toggleRegion(region="", coords=null) {
    if (region === ""){
        region = currentRegion;
    }

    if (currentRegion === region) {
        currentRegion = '';
        resetRegionTag();
        showAllMarkers();
    } else {
        currentRegion = region;
        addRegionTag(region);
    }

    document.body.offsetHeight;

    // Smooth zoom to the region center
    if (currentRegion !== "" || coords) {
        function flyToMarker(){
            setTimeout(() => {
                // Find the actual marker
                const marker = vineyardMarkers.get(`${coords[0]},${coords[1]}`);
                marker.openPopup();
                map.flyTo(marker.getLatLng(), 11, {
                    animate: true,
                    duration: 1
                });
            }, 500);
        }

        if (currentRegion !== "Unknown"){
            map.flyTo(regionCenters[region], 10, {
                animate: true,
                duration: 2
            });
        } else if (coords) {
            // If unknown region, fly to the selected vineyard
            map.flyTo(coords, 10, {
                animate: true,
                duration: 2
            });
        }

        if (coords) {
            // Check if we have to zoom (not currently zoom 10)
            let finishedZoom = false;
            let finishedMove = false;
            map.once('moveend', function() {
                if (finishedZoom) flyToMarker();
                finishedMove = true;
            });

            map.once('zoomend', function() {
                if (finishedMove) flyToMarker();
                finishedZoom = true;
            });
        }
    }
}

// Add event listener to the region link
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('region-link')) {
        event.preventDefault();
        const region = event.target.getAttribute('data-region');
        toggleRegion(region);
    }
});

// Search and auto-complete
const searchBar = document.getElementById('search-bar');
const autocompleteList = document.getElementById('autocomplete-list');
const selectedItemsContainer = document.getElementById('selected-items');

function addRegionTag(region) {
    // Remove any existing selected item
    selectedItemsContainer.innerHTML = '';

    const selectedItem = document.createElement('div');
    selectedItem.className = 'selected-item';
    selectedItem.innerHTML = `<span>${region}</span><button><b>X</b></button>`;
    selectedItem.querySelector('button').addEventListener('click', function() {
        toggleRegion();
    });
    selectedItemsContainer.appendChild(selectedItem);
}

function resetRegionTag(){
    selectedItemsContainer.innerHTML = '';
}

function setupSearch() {
    // All auto-complete items
    const regions = Object.keys(data).filter(region => region !== "Unknown").map(region => `Region: ${region}`);
    const vineyards = Object.values(data).reduce((acc, { vineyards }) => [...acc, ...vineyards.map(vineyard => vineyard[2])], []);
    const items = [...regions, ...vineyards];

    searchBar.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        autocompleteList.innerHTML = '';
        if (!query) return;

        const filteredItems = items.filter(item => item.toLowerCase().includes(query)).slice(0, 100);
        filteredItems.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.textContent = item;
            itemElement.addEventListener('click', function() {
                onItemClick(item);
            });
            autocompleteList.appendChild(itemElement);
        });
    });

    function onItemClick(item) {
        searchBar.value = '';
        autocompleteList.innerHTML = '';

        // Check if it is a region, startswith "Region: "
        if (item.startsWith("Region: ")) {
            toggleRegion(item.replace("Region: ", ""));
        } else {
            // Find the region of the vineyard
            let region = '';
            let coords = null;
            for (const key in data) {
                if (data.hasOwnProperty(key)) {
                    const vineyards = data[key].vineyards;
                    const vineyard = vineyards.find(vineyard => vineyard[2] === item);
                    if (vineyard) {
                        region = key;
                        coords = [vineyard[0], vineyard[1]];
                        break;
                    }
                }
            }
            toggleRegion(region, coords);
        }

    }
};