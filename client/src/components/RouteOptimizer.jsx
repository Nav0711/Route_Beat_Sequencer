import React, { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

function RouteOptimizer() {

    const mapRef = useRef(null);
    const [map, setMap] = useState(null);
    const [beatData, setBeatData] = useState({});
    const [selectedOutlets, setSelectedOutlets] = useState([]);
    const [startCoord, setStartCoord] = useState(null);
    const [optimizedSequence, setOptimizedSequence] = useState([]);
    const [beatSelect, setBeatSelect] = useState('');
    const [routeDistance, setRouteDistance] = useState(0);
    const [routeDuration, setRouteDuration] = useState(0);
    const [manualInput, setManualInput] = useState('');


    useEffect(() => {
        if (!mapRef.current) return;

        if (mapRef.current._leaflet_id != null) return;

        const m = L.map(mapRef.current).setView([28.6139, 77.2090], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
        }).addTo(m);
        setMap(m);
    }, []);

    const handleFile = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet);

            const parsed = {};
            jsonData.forEach(row => {
                const beat = row['Beat Name'] || row['Beat'] || row['beat'];
                const outlet = row['Outlet ID'] || row['Outlet: Outlet Id'];
                const lat = row['Latitude'] || row['lat'];
                const lng = row['Longitude'] || row['lng'];
                const outletName = row['Outlet Name'] || row['Outlet: Account Name'] || row['Outlet:Account Name'];

                if (!beat || !outlet || !lat || !lng) return;
                if (!parsed[beat]) parsed[beat] = [];

                parsed[beat].push({
                    outlet,
                    lat: parseFloat(lat),
                    lng: parseFloat(lng),
                    outletName: outletName || 'N/A'
                });
            });

            setBeatData(parsed);
        };
        reader.readAsArrayBuffer(file);
    };

    const handleBeatChange = (e) => {
        const beat = e.target.value;
        setBeatSelect(beat);
        setSelectedOutlets(beatData[beat] || []);
        if (map) {
            map.eachLayer(layer => {
                if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                    map.removeLayer(layer);
                }
            });
        }
    };

    const useCurrentLocation = () => {
        navigator.geolocation.getCurrentPosition(pos => {
            const coords = [pos.coords.latitude, pos.coords.longitude];
            setStartCoord(coords);
            if (map) {
                L.marker(coords).addTo(map).bindPopup("Start Location").openPopup();
            }
        });
    };

    const generateOptimizedRoute = async () => {
        if (!startCoord || selectedOutlets.length === 0) {
            alert("Start location or outlets missing");
            return;
        }

        try {
            // Step 1: Get distance matrix for all locations using road distances
            const allCoords = [startCoord, ...selectedOutlets.map(outlet => [outlet.lat, outlet.lng])];
            const matrixCoords = allCoords.map(coord => [coord[1], coord[0]]); // Convert to [lng, lat]

            const matrixRes = await axios.post('https://api.openrouteservice.org/v2/matrix/driving-car', {
                locations: matrixCoords,
                metrics: ["distance", "duration"]
            }, {
                headers: {
                    'Authorization': import.meta.env.VITE_ORS_API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            const distanceMatrix = matrixRes.data.distances; // Road distances in meters
            const durationMatrix = matrixRes.data.durations; // Road durations in seconds

            // Step 2: Implement 2-opt optimization algorithm for better route optimization
            const optimizeRoute = (initialRoute, distanceMatrix) => {
                let route = [...initialRoute];
                let improved = true;
                let iterations = 0;
                const maxIterations = 100; // Prevent infinite loops

                while (improved && iterations < maxIterations) {
                    improved = false;
                    iterations++;

                    // Try all possible 2-opt swaps
                    for (let i = 1; i < route.length - 2; i++) {
                        for (let j = i + 1; j < route.length; j++) {
                            if (j - i === 1) continue; // Skip adjacent edges

                            // Calculate current distance
                            const currentDistance =
                                distanceMatrix[route[i - 1]][route[i]] +
                                distanceMatrix[route[j]][route[j + 1] || route[0]];

                            // Calculate distance after 2-opt swap
                            const newDistance =
                                distanceMatrix[route[i - 1]][route[j]] +
                                distanceMatrix[route[i]][route[j + 1] || route[0]];

                            // If improvement found, apply 2-opt swap
                            if (newDistance < currentDistance) {
                                // Reverse the segment between i and j
                                const newRoute = [
                                    ...route.slice(0, i),
                                    ...route.slice(i, j + 1).reverse(),
                                    ...route.slice(j + 1)
                                ];
                                route = newRoute;
                                improved = true;
                            }
                        }
                    }
                }

                return route;
            };

            // Step 3: Create multiple initial routes using different strategies
            const createInitialRoutes = () => {
                const routes = [];

                // Strategy 1: Nearest neighbor from start
                const nearestNeighborRoute = () => {
                    const unvisited = new Set(Array.from({ length: selectedOutlets.length }, (_, i) => i + 1));
                    const route = [0]; // Start with start location
                    let currentIndex = 0;

                    while (unvisited.size > 0) {
                        let nearestIndex = -1;
                        let shortestDistance = Infinity;

                        for (const outletIndex of unvisited) {
                            const roadDistance = distanceMatrix[currentIndex][outletIndex];
                            if (roadDistance < shortestDistance) {
                                shortestDistance = roadDistance;
                                nearestIndex = outletIndex;
                            }
                        }

                        route.push(nearestIndex);
                        unvisited.delete(nearestIndex);
                        currentIndex = nearestIndex;
                    }

                    return route;
                };

                // Strategy 2: Farthest insertion
                const farthestInsertionRoute = () => {
                    if (selectedOutlets.length === 0) return [0];

                    const route = [0]; // Start with start location
                    const unvisited = new Set(Array.from({ length: selectedOutlets.length }, (_, i) => i + 1));

                    // Find the farthest outlet from start
                    let farthestIndex = -1;
                    let maxDistance = -1;
                    for (const outletIndex of unvisited) {
                        if (distanceMatrix[0][outletIndex] > maxDistance) {
                            maxDistance = distanceMatrix[0][outletIndex];
                            farthestIndex = outletIndex;
                        }
                    }
                    route.push(farthestIndex);
                    unvisited.delete(farthestIndex);

                    // Insert remaining outlets at the position that minimizes increase
                    while (unvisited.size > 0) {
                        let bestOutlet = -1;
                        let bestPosition = -1;
                        let minIncrease = Infinity;

                        for (const outletIndex of unvisited) {
                            for (let pos = 1; pos <= route.length; pos++) {
                                const prev = route[pos - 1];
                                const next = route[pos] || route[0];

                                const currentDistance = distanceMatrix[prev][next];
                                const newDistance = distanceMatrix[prev][outletIndex] + distanceMatrix[outletIndex][next];
                                const increase = newDistance - currentDistance;

                                if (increase < minIncrease) {
                                    minIncrease = increase;
                                    bestOutlet = outletIndex;
                                    bestPosition = pos;
                                }
                            }
                        }

                        route.splice(bestPosition, 0, bestOutlet);
                        unvisited.delete(bestOutlet);
                    }

                    return route;
                };

                // Strategy 3: Geographic clustering approach
                const geographicClusterRoute = () => {
                    if (selectedOutlets.length === 0) return [0];

                    // Calculate centroid
                    const centroidLat = selectedOutlets.reduce((sum, outlet) => sum + outlet.lat, 0) / selectedOutlets.length;
                    const centroidLng = selectedOutlets.reduce((sum, outlet) => sum + outlet.lng, 0) / selectedOutlets.length;

                    // Sort outlets by angle from centroid (clockwise sweep)
                    const outletsWithAngle = selectedOutlets.map((outlet, index) => ({
                        index: index + 1,
                        angle: Math.atan2(outlet.lat - centroidLat, outlet.lng - centroidLng)
                    }));

                    outletsWithAngle.sort((a, b) => a.angle - b.angle);
                    return [0, ...outletsWithAngle.map(item => item.index)];
                };

                routes.push(nearestNeighborRoute());
                routes.push(farthestInsertionRoute());
                routes.push(geographicClusterRoute());

                return routes;
            };

            // Step 4: Generate and optimize multiple routes
            const initialRoutes = createInitialRoutes();
            const optimizedRoutes = initialRoutes.map(route => optimizeRoute(route, distanceMatrix));

            // Step 5: Select the best route based on total distance
            let bestRoute = null;
            let bestTotalDistance = Infinity;
            let bestTotalDuration = 0;

            for (const route of optimizedRoutes) {
                let totalDistance = 0;
                let totalDuration = 0;

                for (let i = 0; i < route.length - 1; i++) {
                    totalDistance += distanceMatrix[route[i]][route[i + 1]];
                    totalDuration += durationMatrix[route[i]][route[i + 1]];
                }

                if (totalDistance < bestTotalDistance) {
                    bestTotalDistance = totalDistance;
                    bestTotalDuration = totalDuration;
                    bestRoute = route;
                }
            }

            // Store accurate route stats
            setRouteDistance((bestTotalDistance / 1000).toFixed(2)); // Convert to km
            setRouteDuration((bestTotalDuration / 60).toFixed(0)); // Convert to minutes

            // Step 6: Create ordered outlets and coordinates for route visualization
            const orderedOutlets = bestRoute.slice(1).map(i => selectedOutlets[i - 1]); // Remove start location and convert indices
            const orderedCoords = [startCoord, ...orderedOutlets.map(outlet => [outlet.lat, outlet.lng])];

            // Step 7: Get detailed route geometry for visualization
            const directionsRes = await axios.post('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
                coordinates: orderedCoords.map(coord => [coord[1], coord[0]]) // Convert to [lng, lat]
            }, {
                headers: {
                    'Authorization': import.meta.env.VITE_ORS_API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            const geometry = directionsRes.data.features[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);

            // Step 8: Clear existing layers and add new route
            map.eachLayer(layer => {
                if (layer instanceof L.Polyline || layer instanceof L.Marker) {
                    map.removeLayer(layer);
                }
            });

            // Add route polyline with gradient color to show direction
            const routePolyline = L.polyline(geometry, {
                color: 'blue',
                weight: 4,
                opacity: 0.8
            }).addTo(map);

            // Add direction arrows along the route
            const addDirectionArrows = (polyline) => {
                const latlngs = polyline.getLatLngs();
                const arrowSpacing = Math.max(1, Math.floor(latlngs.length / 10)); // Add ~10 arrows

                for (let i = arrowSpacing; i < latlngs.length; i += arrowSpacing) {
                    const start = latlngs[i - 1];
                    const end = latlngs[i];
                    const bearing = calculateBearing(start, end);

                    const arrowIcon = L.divIcon({
                        className: 'direction-arrow',
                        html: `<div style="
                        transform: rotate(${bearing}deg);
                        font-size: 16px;
                        color: #007bff;
                        text-shadow: 1px 1px 2px white;
                    ">➤</div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    });

                    L.marker(end, { icon: arrowIcon }).addTo(map);
                }
            };

            const calculateBearing = (start, end) => {
                const deltaLng = end.lng - start.lng;
                const deltaLat = end.lat - start.lat;
                const bearing = Math.atan2(deltaLng, deltaLat) * (180 / Math.PI);
                return bearing;
            };

            addDirectionArrows(routePolyline);

            // Step 9: Add markers with sequence numbers and enhanced styling
            orderedCoords.forEach((coord, index) => {
                const outlet = index > 0 ? orderedOutlets[index - 1] : null;

                const customIcon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="
                    background: ${index === 0 ?
                            'linear-gradient(135deg, #ff4757, #ff3742)' :
                            'linear-gradient(135deg, #4ecdc4, #44a08d)'
                        }; 
                    width: 35px; 
                    height: 35px; 
                    border-radius: 50%; 
                    border: 3px solid white;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                ">
                    <span style="
                        color: white; 
                        font-weight: bold; 
                        font-size: 14px;
                        text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
                    ">
                        ${index === 0 ? 'S' : index}
                    </span>
                    ${index > 0 ? `<div style="
                        position: absolute;
                        top: -8px;
                        right: -8px;
                        background: #007bff;
                        color: white;
                        border-radius: 50%;
                        width: 16px;
                        height: 16px;
                        font-size: 10px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                    ">${index}</div>` : ''}
                </div>`,
                    iconSize: [35, 35],
                    iconAnchor: [17.5, 17.5]
                });

                const popupContent = index === 0
                    ? '<strong>🏁 Start Location</strong><br><small>Route optimization complete</small>'
                    : `<strong>📍 Stop ${index}</strong><br>
                   <b>Outlet ID:</b> ${outlet?.outlet}<br>
                   <b>Name:</b> ${outlet?.outletName || 'N/A'}<br>
                   <b>Coordinates:</b> ${outlet?.lat.toFixed(6)}, ${outlet?.lng.toFixed(6)}<br>
                   <small style="color: #007bff;">✓ Optimized with 2-opt algorithm</small>`;

                L.marker(coord, { icon: customIcon }).addTo(map).bindPopup(popupContent);
            });

            // Step 10: Fit map to route bounds with better padding
            const bounds = L.latLngBounds(geometry);
            map.fitBounds(bounds, { padding: [60, 60] });

            // Update state with optimized sequence
            setOptimizedSequence(orderedOutlets);

            console.log(`Route optimized successfully using 2-opt algorithm. Total distance: ${(bestTotalDistance / 1000).toFixed(2)} km`);
            console.log(`Optimization completed in multiple strategies with best route selected.`);

        } catch (err) {
            console.error("Route optimization error:", err.response?.data || err.message);
            alert("Failed to optimize route. Please check your API key and network connection.");
        }
    };

    
    const downloadOptimizedRoute = () => {
        if (optimizedSequence.length === 0) {
            alert("No optimized route available. Please generate a route first.");
            return;
        }

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Prepare main route data
        const routeData = [];

        // Add start location
        routeData.push({
            'Sequence': 0,
            'Outlet ID': 'START',
            'Outlet Name': 'Start Location',
            'Beat Name': beatSelect,
            'Latitude': startCoord[0],
            'Longitude': startCoord[1],
            'Visit Order': 'Starting Point',
            'Notes': 'Begin route from this location'
        });

        // Add optimized outlets
        optimizedSequence.forEach((outlet, index) => {
            routeData.push({
                'Sequence': index + 1,
                'Outlet ID': outlet.outlet,
                'Outlet Name': outlet.outletName,
                'Beat Name': beatSelect,
                'Latitude': outlet.lat,
                'Longitude': outlet.lng,
                'Visit Order': `Stop ${index + 1}`,
                'Notes': 'Optimized by road distance'
            });
        });

        // Create main route worksheet
        const routeWs = XLSX.utils.json_to_sheet(routeData);

        // Set column widths for route sheet
        routeWs['!cols'] = [
            { width: 10 }, // Sequence
            { width: 15 }, // Outlet ID
            { width: 25 }, // Outlet Name
            { width: 15 }, // Beat Name
            { width: 12 }, // Latitude
            { width: 12 }, // Longitude
            { width: 15 }, // Visit Order
            { width: 25 }  // Notes
        ];

        XLSX.utils.book_append_sheet(wb, routeWs, 'Route Details');

        // Create summary sheet
        const summaryData = [
            ['ROUTE OPTIMIZATION SUMMARY', ''],
            ['', ''],
            ['Beat Name', beatSelect],
            ['Total Outlets', optimizedSequence.length],
            ['Total Distance (km)', routeDistance],
            ['Estimated Duration (minutes)', routeDuration],
            ['Estimated Duration (hours)', (routeDuration / 60).toFixed(1)],
            ['', ''],
            ['OPTIMIZATION DETAILS', ''],
            ['', ''],
            ['Algorithm Used', 'Nearest Neighbor with Road Distances'],
            ['Distance Calculation', 'OpenRouteService Driving Matrix'],
            ['Route Type', 'Optimized for shortest road distance'],
            ['Generated On', new Date().toLocaleString()],
            ['', ''],
            ['START LOCATION', ''],
            ['', ''],
            ['Latitude', startCoord[0]],
            ['Longitude', startCoord[1]],
            ['', ''],
            ['OUTLET SEQUENCE', ''],
            ['', '']
        ];

        // Add outlet sequence to summary
        optimizedSequence.forEach((outlet, index) => {
            summaryData.push([
                `Stop ${index + 1}`,
                `${outlet.outletName} (ID: ${outlet.outlet})`
            ]);
        });

        // Add performance metrics
        summaryData.push(['', '']);
        summaryData.push(['PERFORMANCE METRICS', '']);
        summaryData.push(['', '']);
        summaryData.push(['Average Distance per Stop (km)', (routeDistance / Math.max(optimizedSequence.length, 1)).toFixed(2)]);
        summaryData.push(['Average Time per Stop (minutes)', (routeDuration / Math.max(optimizedSequence.length, 1)).toFixed(1)]);
        summaryData.push(['Outlets per Hour (estimated)', (optimizedSequence.length / Math.max(routeDuration / 60, 1)).toFixed(1)]);

        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);

        // Style the summary sheet
        summaryWs['!cols'] = [
            { width: 30 }, // Labels
            { width: 25 }  // Values
        ];

        // Merge cells for headers
        if (!summaryWs['!merges']) summaryWs['!merges'] = [];
        summaryWs['!merges'].push(
            { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }, // Title
            { s: { r: 8, c: 0 }, e: { r: 8, c: 1 } }, // Optimization Details
            { s: { r: 15, c: 0 }, e: { r: 15, c: 1 } }, // Start Location
            { s: { r: 20, c: 0 }, e: { r: 20, c: 1 } }, // Outlet Sequence
            { s: { r: 22 + optimizedSequence.length, c: 0 }, e: { r: 22 + optimizedSequence.length, c: 1 } } // Performance Metrics
        );

        XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

        // Create coordinates sheet for easy copy-paste
        const coordsData = [
            ['Sequence', 'Latitude', 'Longitude', 'Location']
        ];

        coordsData.push([0, startCoord[0], startCoord[1], 'Start Location']);

        optimizedSequence.forEach((outlet, index) => {
            coordsData.push([
                index + 1,
                outlet.lat,
                outlet.lng,
                `${outlet.outletName} (${outlet.outlet})`
            ]);
        });

        const coordsWs = XLSX.utils.aoa_to_sheet(coordsData);
        coordsWs['!cols'] = [
            { width: 10 }, // Sequence
            { width: 15 }, // Latitude
            { width: 15 }, // Longitude
            { width: 30 }  // Location
        ];

        XLSX.utils.book_append_sheet(wb, coordsWs, 'Coordinates');

        // Generate filename with beat name and timestamp
        const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const filename = `Optimized_Route_${beatSelect}_${timestamp}.xlsx`;

        // Download file
        XLSX.writeFile(wb, filename);

        console.log(`Downloaded optimized route as ${filename}`);
    };
    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h2 style={{ color: '#333', marginBottom: '20px' }}>Beat Route Optimizer</h2>

            <div style={{ marginBottom: '15px' }}>
                <input
                    type="file"
                    onChange={handleFile}
                    accept=".xlsx, .xls"
                    style={{ marginRight: '10px' }}
                />
                <select
                    onChange={handleBeatChange}
                    value={beatSelect}
                    style={{ padding: '5px', marginRight: '10px' }}
                >
                    <option>Select Beat</option>
                    {Object.keys(beatData).map(beat => (
                        <option key={beat} value={beat}>{beat}</option>
                    ))}
                </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
                <input
                    type="text"
                    placeholder="Enter start coordinates (lat,lng)"
                    value={manualInput}
                    onChange={(e) => {
                        const value = e.target.value;
                        setManualInput(value);

                        const [lat, lng] = value.split(',').map(Number);
                        if (
                            !isNaN(lat) &&
                            !isNaN(lng) &&
                            lat >= -90 &&
                            lat <= 90 &&
                            lng >= -180 &&
                            lng <= 180
                        ) {
                            setStartCoord([lat, lng]);

                            // Clear old markers
                            map.eachLayer(layer => {
                                if (layer instanceof L.Marker) map.removeLayer(layer);
                            });

                            L.marker([lat, lng])
                                .addTo(map)
                                .bindPopup("Start Location (Manual)")
                                .openPopup();
                        }
                    }}
                />

                <button
                    onClick={useCurrentLocation}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        marginRight: '10px',
                        cursor: 'pointer'
                    }}
                >
                    Use Current Location
                </button>
                <button
                    onClick={generateOptimizedRoute}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        marginRight: '10px',
                        cursor: 'pointer'
                    }}
                >
                    Generate Optimized Route
                </button>
                <button
                    onClick={downloadOptimizedRoute}
                    disabled={optimizedSequence.length === 0}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: optimizedSequence.length === 0 ? '#6c757d' : '#ffc107',
                        color: optimizedSequence.length === 0 ? '#fff' : '#000',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: optimizedSequence.length === 0 ? 'not-allowed' : 'pointer'
                    }}
                >
                    Download Excel
                </button>
            </div>

            {optimizedSequence.length > 0 && (
                <div style={{
                    backgroundColor: '#f8f9fa',
                    padding: '10px',
                    borderRadius: '4px',
                    marginBottom: '15px',
                    border: '1px solid #dee2e6'
                }}>
                    <strong>Route Summary:</strong> {optimizedSequence.length} outlets |
                    Distance: {routeDistance} km |
                    Duration: {routeDuration} minutes
                </div>
            )}

            <div
                id="map"
                ref={mapRef}
                style={{
                    height: "500px",
                    border: '1px solid #ccc',
                    borderRadius: '4px'
                }}
            ></div>
        </div>
    );
}

export default RouteOptimizer;