import React, { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import FileUploadHandler from './components/FileUploadHandler';
import BeatSelector from './components/BeatSelector';
import UseCurrentLocation from './components/UseCurrentLocation';

// Calculates the total distance of the route using the distance matrix
function calculateRouteDistance(route, distanceMatrix, isClosed = false) {
    let total = 0;
    for (let i = 0; i < route.length - 1; i++) {
        total += distanceMatrix[route[i]][route[i + 1]];
    }
    if (isClosed && route.length > 1) {
        total += distanceMatrix[route[route.length - 1]][route[0]];
    }
    return total;
}

// Calculates the total duration of the route using the duration matrix
function calculateRouteDuration(route, durationMatrix, isClosed = false) {
    let total = 0;
    for (let i = 0; i < route.length - 1; i++) {
        total += durationMatrix[route[i]][route[i + 1]];
    }
    if (isClosed && route.length > 1) {
        total += durationMatrix[route[route.length - 1]][route[0]];
    }
    return total;
}

// Nearest Neighbor Algorithm
function buildNearestNeighborRoute(distanceMatrix, n) {
    const visited = new Array(n + 1).fill(false);
    const route = [0];
    visited[0] = true;
    for (let step = 0; step < n; step++) {
        const last = route[route.length - 1];
        let nearest = -1;
        let nearestDist = Infinity;
        for (let i = 1; i <= n; i++) {
            if (!visited[i] && distanceMatrix[last][i] < nearestDist) {
                nearestDist = distanceMatrix[last][i];
                nearest = i;
            }
        }
        if (nearest !== -1) {
            route.push(nearest);
            visited[nearest] = true;
        }
    }
    return route;
}

// Farthest Insertion Algorithm
function buildFarthestInsertionRoute(distanceMatrix, n) {
    const visited = new Array(n + 1).fill(false);
    const route = [0];
    visited[0] = true;
    // Find farthest point from start
    let farthest = 1;
    let maxDist = -Infinity;
    for (let i = 1; i <= n; i++) {
        if (distanceMatrix[0][i] > maxDist) {
            maxDist = distanceMatrix[0][i];
            farthest = i;
        }
    }
    route.push(farthest);
    visited[farthest] = true;
    while (route.length < n + 1) {
        // Find unvisited node farthest from any in route
        let next = -1, nextDist = -Infinity;
        for (let i = 1; i <= n; i++) {
            if (!visited[i]) {
                let minToRoute = Math.min(...route.map(r => distanceMatrix[r][i]));
                if (minToRoute > nextDist) {
                    nextDist = minToRoute;
                    next = i;
                }
            }
        }
        // Insert at position that minimizes increase in route length
        let bestPos = 1, bestIncrease = Infinity;
        for (let j = 1; j < route.length; j++) {
            let increase = distanceMatrix[route[j - 1]][next] + distanceMatrix[next][route[j]] - distanceMatrix[route[j - 1]][route[j]];
            if (increase < bestIncrease) {
                bestIncrease = increase;
                bestPos = j;
            }
        }
        route.splice(bestPos, 0, next);
        visited[next] = true;
    }
    return route;
}

// Randomized Nearest Neighbor Algorithm
function buildRandomizedNearestNeighbor(distanceMatrix, n, trials = 5) {
    let bestRoute = null;
    let bestDist = Infinity;
    for (let t = 0; t < trials; t++) {
        const visited = new Array(n + 1).fill(false);
        let route = [0];
        visited[0] = true;
        let current = Math.floor(Math.random() * n) + 1;
        route.push(current);
        visited[current] = true;
        for (let step = 1; step < n; step++) {
            let last = route[route.length - 1];
            let nearest = -1, nearestDist = Infinity;
            for (let i = 1; i <= n; i++) {
                if (!visited[i] && distanceMatrix[last][i] < nearestDist) {
                    nearestDist = distanceMatrix[last][i];
                    nearest = i;
                }
            }
            if (nearest !== -1) {
                route.push(nearest);
                visited[nearest] = true;
            }
        }
        let dist = calculateRouteDistance(route, distanceMatrix, false);
        if (dist < bestDist) {
            bestDist = dist;
            bestRoute = route;
        }
    }
    return bestRoute;
}

// 2-Opt Optimization
function twoOpt(route, distanceMatrix) {
    let improved = true;
    let best = route.slice();
    let bestDist = calculateRouteDistance(best, distanceMatrix, false);
    while (improved) {
        improved = false;
        for (let i = 1; i < best.length - 2; i++) {
            for (let k = i + 1; k < best.length - 1; k++) {
                let newRoute = best.slice();
                newRoute.splice(i, k - i + 1, ...best.slice(i, k + 1).reverse());
                let newDist = calculateRouteDistance(newRoute, distanceMatrix, false);
                if (newDist < bestDist) {
                    best = newRoute;
                    bestDist = newDist;
                    improved = true;
                }
            }
        }
    }
    return best;
}

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
    const [isOptimizing, setIsOptimizing] = useState(false);

    useEffect(() => {
        if (!mapRef.current) return;
        if (mapRef.current._leaflet_id != null) return;

        const m = L.map(mapRef.current).setView([28.6139, 77.2090], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
        }).addTo(m);
        setMap(m);
    }, []);

    // ADD this new handler function to receive data from the FileUploadHandler component
    const handleDataParsed = (parsedData) => {
        setBeatData(parsedData);
        // Clear selected outlets and reset state when new data is loaded
        setSelectedOutlets([]);
        setBeatSelect('');
        setOptimizedSequence([]);
        setRouteDistance(0);
        setRouteDuration(0);

        // Clear map markers if map exists
        if (map) {
            map.eachLayer(layer => {
                if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                    map.removeLayer(layer);
                }
            });

            // Re-add start location marker if it exists
            if (startCoord) {
                L.marker(startCoord).addTo(map).bindPopup("Start Location").openPopup();
            }
        }
    };

    const handleBeatChange = (beat, outlets) => {
        setBeatSelect(beat);
        setSelectedOutlets(outlets);
        setOptimizedSequence([]); // Reset optimized sequence
        setRouteDistance(0);
        setRouteDuration(0);

        if (map) {
            map.eachLayer(layer => {
                if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                    map.removeLayer(layer);
                }
            });

            // Re-add start location marker if it exists
            if (startCoord) {
                L.marker(startCoord).addTo(map).bindPopup("Start Location").openPopup();
            }
        }
    };

    

    // Enhanced distance calculation for validation
    const calculateHaversineDistance = (lat1, lng1, lat2, lng2) => {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c * 1000; // Return in meters
    };

    const generateOptimizedRoute = async () => {
        if (!startCoord || selectedOutlets.length === 0) {
            alert("Please set a start location and select outlets");
            return;
        }

        setIsOptimizing(true);

        // Reset previous optimization results
        setOptimizedSequence([]);
        setRouteDistance(0);
        setRouteDuration(0);

        // Clear existing map layers
        if (map) {
            map.eachLayer(layer => {
                if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                    map.removeLayer(layer);
                }
            });
        }

        try {
            console.log("Starting enhanced route optimization with multiple options...");
            console.log("Start coordinates:", startCoord);
            console.log("Number of outlets:", selectedOutlets.length);

            // Step 1: Prepare coordinates
            const allCoords = [startCoord, ...selectedOutlets.map(outlet => [outlet.lat, outlet.lng])];
            const matrixCoords = allCoords.map(coord => [coord[1], coord[0]]);

            console.log("Getting distance matrix...");
            const matrixRes = await axios.post('https://api.openrouteservice.org/v2/matrix/driving-car', {
                locations: matrixCoords,
                metrics: ["distance", "duration"]
            }, {
                headers: {
                    'Authorization': import.meta.env.VITE_ORS_API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            const distanceMatrix = matrixRes.data.distances;
            const durationMatrix = matrixRes.data.durations;

            const n = selectedOutlets.length;

            // Enhanced sequence optimization for better outlet flow
            function optimizeSequenceFlow(route, distanceMatrix, outlets, startCoord, clusterRadius = 2000) {
                if (route.length <= 2) return route;

                const outletCoords = route.slice(1).map(i => ({
                    index: i,
                    lat: outlets[i - 1].lat,
                    lng: outlets[i - 1].lng
                }));

                const clusters = [];
                const visited = new Set();

                outletCoords.forEach(outlet => {
                    if (visited.has(outlet.index)) return;

                    const cluster = [outlet];
                    visited.add(outlet.index);

                    outletCoords.forEach(other => {
                        if (visited.has(other.index)) return;

                        const distance = calculateHaversineDistance(
                            outlet.lat, outlet.lng,
                            other.lat, other.lng
                        );

                        if (distance <= clusterRadius) {
                            cluster.push(other);
                            visited.add(other.index);
                        }
                    });

                    clusters.push(cluster);
                });

                clusters.sort((a, b) => {
                    const avgA = a.reduce((sum, outlet) =>
                        sum + distanceMatrix[0][outlet.index], 0) / a.length;
                    const avgB = b.reduce((sum, outlet) =>
                        sum + distanceMatrix[0][outlet.index], 0) / b.length;
                    return avgA - avgB;
                });

                const optimizedRoute = [0];

                clusters.forEach(cluster => {
                    if (cluster.length === 1) {
                        optimizedRoute.push(cluster[0].index);
                    } else {
                        const clusterIndices = cluster.map(c => c.index);
                        const lastInRoute = optimizedRoute[optimizedRoute.length - 1];

                        let bestEntry = clusterIndices[0];
                        let minEntryDist = distanceMatrix[lastInRoute][bestEntry];

                        clusterIndices.forEach(idx => {
                            if (distanceMatrix[lastInRoute][idx] < minEntryDist) {
                                minEntryDist = distanceMatrix[lastInRoute][idx];
                                bestEntry = idx;
                            }
                        });

                        const clusterRoute = [bestEntry];
                        const remaining = clusterIndices.filter(i => i !== bestEntry);

                        while (remaining.length > 0) {
                            const current = clusterRoute[clusterRoute.length - 1];
                            let nearest = remaining[0];
                            let nearestDist = distanceMatrix[current][nearest];

                            remaining.forEach(idx => {
                                if (distanceMatrix[current][idx] < nearestDist) {
                                    nearestDist = distanceMatrix[current][idx];
                                    nearest = idx;
                                }
                            });

                            clusterRoute.push(nearest);
                            remaining.splice(remaining.indexOf(nearest), 1);
                        }

                        optimizedRoute.push(...clusterRoute);
                    }
                });

                return optimizedRoute;
            }

            // Geographic-based route (sorted by distance from start)
            function buildGeographicRoute(distanceMatrix, n) {
                const outlets = Array.from({ length: n }, (_, i) => i + 1);
                outlets.sort((a, b) => distanceMatrix[0][a] - distanceMatrix[0][b]);
                return [0, ...outlets];
            }

            // Generate multiple route options
            console.log("Generating multiple route options...");

            // Option 1: Nearest Neighbor + 2-Opt
            const nnRoute = buildNearestNeighborRoute(distanceMatrix, n);
            const option1 = twoOpt(nnRoute, distanceMatrix);

            // Option 2: Farthest Insertion + 2-Opt
            const fiRoute = buildFarthestInsertionRoute(distanceMatrix, n);
            const option2 = twoOpt(fiRoute, distanceMatrix);

            // Option 3: Randomized Nearest Neighbor + 2-Opt
            const rnnRoute = buildRandomizedNearestNeighbor(distanceMatrix, n, 10);
            const option3 = twoOpt(rnnRoute, distanceMatrix);

            // Option 4: Geographic + 2-Opt
            const geoRoute = buildGeographicRoute(distanceMatrix, n);
            const option4 = twoOpt(geoRoute, distanceMatrix);

            // Apply sequence flow optimization to each option with different cluster sizes
            const sequenceOption1 = optimizeSequenceFlow(option1, distanceMatrix, selectedOutlets, startCoord, 1500); // Tight clusters
            const sequenceOption2 = optimizeSequenceFlow(option2, distanceMatrix, selectedOutlets, startCoord, 2500); // Medium clusters
            const sequenceOption3 = optimizeSequenceFlow(option3, distanceMatrix, selectedOutlets, startCoord, 3500); // Loose clusters
            const sequenceOption4 = optimizeSequenceFlow(option4, distanceMatrix, selectedOutlets, startCoord, 2000); // Standard clusters

            // Calculate metrics for all options
            const routeOptions = [
                {
                    name: "Optimized Distance (Tight Clusters)",
                    route: sequenceOption1,
                    distance: calculateRouteDistance(sequenceOption1, distanceMatrix, false),
                    duration: calculateRouteDuration(sequenceOption1, durationMatrix, false),
                    description: "Prioritizes shortest distance with tight geographic grouping"
                },
                {
                    name: "Balanced Flow (Medium Clusters)",
                    route: sequenceOption2,
                    distance: calculateRouteDistance(sequenceOption2, distanceMatrix, false),
                    duration: calculateRouteDuration(sequenceOption2, durationMatrix, false),
                    description: "Balances distance and logical sequence flow"
                },
                {
                    name: "Sequence Flow (Loose Clusters)",
                    route: sequenceOption3,
                    distance: calculateRouteDistance(sequenceOption3, distanceMatrix, false),
                    duration: calculateRouteDuration(sequenceOption3, durationMatrix, false),
                    description: "Prioritizes smooth sequence flow over distance"
                },
                {
                    name: "Geographic Order",
                    route: sequenceOption4,
                    distance: calculateRouteDistance(sequenceOption4, distanceMatrix, false),
                    duration: calculateRouteDuration(sequenceOption4, durationMatrix, false),
                    description: "Simple distance-based ordering with clustering"
                }
            ];

            // Sort options by distance
            routeOptions.sort((a, b) => a.distance - b.distance);

            console.log("Route options generated:");
            routeOptions.forEach((option, index) => {
                console.log(`${index + 1}. ${option.name}: ${(option.distance / 1000).toFixed(2)}km, ${(option.duration / 60).toFixed(0)}min`);
            });

            // Present options to user
            const optionsList = routeOptions.map((option, index) =>
                `${index + 1}. ${option.name}\n   Distance: ${(option.distance / 1000).toFixed(2)} km | Duration: ${(option.duration / 60).toFixed(0)} min\n   ${option.description}`
            ).join('\n\n');

            const userChoice = prompt(
                `🚗 Choose your preferred route optimization:\n\n${optionsList}\n\nEnter option number (1-4), or press Cancel for automatic best:`,
                "1"
            );

            let selectedOption;
            if (userChoice && userChoice >= 1 && userChoice <= 4) {
                selectedOption = routeOptions[parseInt(userChoice) - 1];
                console.log(`User selected: ${selectedOption.name}`);
            } else {
                selectedOption = routeOptions[0]; // Default to best distance
                console.log("Using automatic best option (shortest distance)");
            }

            const finalRoute = selectedOption.route;
            const bestDistance = selectedOption.distance;
            const bestDuration = selectedOption.duration;

            console.log(`Selected route (${selectedOption.name}): ${(bestDistance / 1000).toFixed(2)} km, ${(bestDuration / 60).toFixed(0)} min`);
            console.log("Final route sequence:", finalRoute);

            // Prepare and display results
            const orderedOutlets = finalRoute.slice(1).map(i => selectedOutlets[i - 1]);
            const orderedCoords = [startCoord, ...orderedOutlets.map(outlet => [outlet.lat, outlet.lng])];

            setRouteDistance((bestDistance / 1000).toFixed(2));
            setRouteDuration((bestDuration / 60).toFixed(0));
            setOptimizedSequence(orderedOutlets);

            // Get route geometry and visualize
            console.log("Getting route geometry...");
            const directionsRes = await axios.post('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
                coordinates: orderedCoords.map(coord => [coord[1], coord[0]])
            }, {
                headers: {
                    'Authorization': import.meta.env.VITE_ORS_API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            const geometry = directionsRes.data.features[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);

            // Visualize on map
            map.eachLayer(layer => {
                if (layer instanceof L.Polyline || layer instanceof L.Marker) {
                    map.removeLayer(layer);
                }
            });

            L.polyline(geometry, {
                color: '#007bff',
                weight: 5,
                opacity: 0.8,
                dashArray: '10, 5'
            }).addTo(map);

            // Replace the map visualization section in generateOptimizedRoute function
            // Find this part in your code and replace it:

            // GROUP OVERLAPPING OUTLETS BEFORE VISUALIZATION
            const groupedMarkers = [];
            const OVERLAP_THRESHOLD = 50; // meters - adjust as needed

            orderedCoords.forEach((coord, index) => {
                const outlet = index > 0 ? orderedOutlets[index - 1] : null;

                // Check if this coordinate overlaps with any existing grouped marker
                let addedToGroup = false;

                for (let group of groupedMarkers) {
                    const distance = calculateHaversineDistance(
                        coord[0], coord[1],
                        group.coord[0], group.coord[1]
                    );

                    if (distance <= OVERLAP_THRESHOLD) {
                        // Add to existing group
                        group.outlets.push({ index, outlet, coord });
                        addedToGroup = true;
                        break;
                    }
                }

                if (!addedToGroup) {
                    // Create new group
                    groupedMarkers.push({
                        coord: coord,
                        outlets: [{ index, outlet, coord }]
                    });
                }
            });

            // VISUALIZE GROUPED MARKERS
            groupedMarkers.forEach(group => {
                const getMarkerColor = (index) => {
                    if (index === 0) return '#ff4757';
                    const colors = ['#3742fa', '#2ed573', '#ffa502', '#ff6348', '#1e90ff', '#ff1493', '#32cd32', '#ff4500'];
                    return colors[index % colors.length];
                };

                // Use the first outlet's index for coloring
                const primaryIndex = group.outlets[0].index;

                const customIcon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="
            background: ${getMarkerColor(primaryIndex)}; 
            width: 40px; 
            height: 40px; 
            border-radius: 50%; 
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: white;
            font-size: ${group.outlets.length > 1 ? '12px' : '16px'};
            text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
        ">
            ${primaryIndex === 0 ? 'S' : (group.outlets.length > 1 ? `${primaryIndex}+` : primaryIndex)}
        </div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });

                // CREATE COMBINED POPUP CONTENT
                let popupContent = '';

                if (group.outlets.length === 1) {
                    // Single outlet - use original popup format
                    const { index, outlet } = group.outlets[0];

                    popupContent = index === 0
                        ? `<div style="min-width: 200px;">
                 <h4 style="margin: 0 0 10px 0; color: #007bff;">🏁 Start Location</h4>
                 <p style="margin: 5px 0;"><strong>Coordinates:</strong> ${startCoord[0].toFixed(6)}, ${startCoord[1].toFixed(6)}</p>
                 <p style="margin: 5px 0; color: #28a745; font-size: 12px;">✓ ${selectedOption.name}</p>
               </div>`
                        : `<div style="min-width: 250px;">
                 <h4 style="margin: 0 0 10px 0; color: #007bff;">📍 Stop ${index}</h4>
                 <p style="margin: 5px 0;"><strong>Outlet ID:</strong> ${outlet?.outlet}</p>
                 <p style="margin: 5px 0;"><strong>Name:</strong> ${outlet?.outletName || 'N/A'}</p>
                 <p style="margin: 5px 0;"><strong>Coordinates:</strong> ${outlet?.lat.toFixed(6)}, ${outlet?.lng.toFixed(6)}</p>
                 <p style="margin: 5px 0; color: #28a745; font-size: 12px;">✓ ${selectedOption.name}</p>
               </div>`;
                } else {
                    // Multiple outlets - create combined popup
                    const startOutlet = group.outlets.find(o => o.index === 0);
                    const regularOutlets = group.outlets.filter(o => o.index !== 0);

                    popupContent = `<div style="min-width: 300px; max-height: 400px; overflow-y: auto;">`;

                    if (startOutlet) {
                        popupContent += `
                <h4 style="margin: 0 0 10px 0; color: #007bff;">🏁 Start Location</h4>
                <p style="margin: 5px 0;"><strong>Coordinates:</strong> ${startCoord[0].toFixed(6)}, ${startCoord[1].toFixed(6)}</p>
                <hr style="margin: 10px 0; border: 1px solid #eee;">
            `;
                    }

                    if (regularOutlets.length > 0) {
                        popupContent += `<h4 style="margin: 0 0 10px 0; color: #007bff;">📍 ${regularOutlets.length} Overlapping Stops</h4>`;

                        regularOutlets.forEach(({ index, outlet }, i) => {
                            popupContent += `
                    <div style="background: #f8f9fa; padding: 10px; margin: 5px 0; border-radius: 5px; border-left: 4px solid #007bff;">
                        <p style="margin: 0 0 5px 0; font-weight: bold;">Stop ${index}</p>
                        <p style="margin: 2px 0; font-size: 13px;"><strong>Outlet ID:</strong> ${outlet?.outlet}</p>
                        <p style="margin: 2px 0; font-size: 13px;"><strong>Name:</strong> ${outlet?.outletName || 'N/A'}</p>
                        <p style="margin: 2px 0; font-size: 13px;"><strong>Coordinates:</strong> ${outlet?.lat.toFixed(6)}, ${outlet?.lng.toFixed(6)}</p>
                    </div>
                `;
                        });
                    }

                    popupContent += `
            <p style="margin: 10px 0 0 0; color: #28a745; font-size: 12px; text-align: center;">✓ ${selectedOption.name}</p>
            </div>
        `;
                }

                L.marker(group.coord, { icon: customIcon }).addTo(map).bindPopup(popupContent);
            });

            const bounds = L.latLngBounds(geometry);
            map.fitBounds(bounds, { padding: [50, 50] });

            console.log(`Route optimization completed using: ${selectedOption.name}`);

        } catch (err) {
            console.error("Route optimization error:", err);
            alert(`Failed to optimize route: ${err.response?.data?.error?.message || err.message}`);

            setOptimizedSequence([]);
            setRouteDistance(0);
            setRouteDuration(0);
        } finally {
            setIsOptimizing(false);
        }
    };

    const downloadOptimizedRoute = () => {
        if (optimizedSequence.length === 0) {
            alert("No optimized route available. Please generate a route first.");
            return;
        }

        const wb = XLSX.utils.book_new();

        // Main route data
        const routeData = [];
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

        optimizedSequence.forEach((outlet, index) => {
            routeData.push({
                'Sequence': index + 1,
                'Outlet ID': outlet.outlet,
                'Outlet Name': outlet.outletName,
                'Beat Name': beatSelect,
                'Latitude': outlet.lat,
                'Longitude': outlet.lng,
                'Visit Order': `Stop ${index + 1}`,
                'Notes': 'Optimized using enhanced 2-opt algorithm'
            });
        });

        const routeWs = XLSX.utils.json_to_sheet(routeData);
        routeWs['!cols'] = [
            { width: 10 }, { width: 15 }, { width: 25 }, { width: 15 },
            { width: 12 }, { width: 12 }, { width: 15 }, { width: 30 }
        ];
        XLSX.utils.book_append_sheet(wb, routeWs, 'Route Details');

        // Summary data
        const summaryData = [
            ['ENHANCED ROUTE OPTIMIZATION SUMMARY', ''],
            ['', ''],
            ['Beat Name', beatSelect],
            ['Total Outlets', optimizedSequence.length],
            ['Total Distance (km)', routeDistance],
            ['Estimated Duration (minutes)', routeDuration],
            ['Estimated Duration (hours)', (routeDuration / 60).toFixed(1)],
            ['', ''],
            ['OPTIMIZATION DETAILS', ''],
            ['', ''],
            ['Algorithm Used', 'Enhanced 2-opt with Multiple Initial Routes'],
            ['Distance Calculation', 'OpenRouteService Road Network'],
            ['Route Strategies', 'Nearest Neighbor, Farthest First, Geographic, Random'],
            ['Generated On', new Date().toLocaleString()],
            ['', ''],
            ['START LOCATION', ''],
            ['', ''],
            ['Latitude', startCoord[0]],
            ['Longitude', startCoord[1]]
        ];

        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        summaryWs['!cols'] = [{ width: 35 }, { width: 25 }];
        XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

        // Download
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `Enhanced_Route_${beatSelect}_${timestamp}.xlsx`;
        XLSX.writeFile(wb, filename);
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ color: '#333', marginBottom: '20px', textAlign: 'center' }}>Enhanced Beat Route Optimizer</h2>

            <div style={{
                backgroundColor: '#f8f9fa',
                padding: '15px',
                borderRadius: '8px',
                marginBottom: '20px',
                border: '1px solid #dee2e6'
            }}>
                <FileUploadHandler
                    onDataParsed={handleDataParsed}
                    selectedOutletsCount={selectedOutlets.length}
                />
                
                <BeatSelector
                    beatData={beatData}
                    selectedBeat={beatSelect}
                    onBeatChange={handleBeatChange}
                    selectedOutletsCount={selectedOutlets.length}
                    disabled={isOptimizing}
                />

                <div style={{ marginBottom: '15px' }}>
                    <input
                        type="text"
                        placeholder="Enter start coordinates (lat,lng) e.g., 28.6139,77.2090"
                        value={manualInput}
                        onChange={(e) => {
                            const value = e.target.value;
                            setManualInput(value);

                            const [lat, lng] = value.split(',').map(s => parseFloat(s.trim()));
                            if (
                                !isNaN(lat) && !isNaN(lng) &&
                                lat >= -90 && lat <= 90 &&
                                lng >= -180 && lng <= 180
                            ) {
                                setStartCoord([lat, lng]);

                                if (map) {
                                    map.eachLayer(layer => {
                                        if (layer instanceof L.Marker) map.removeLayer(layer);
                                    });

                                    L.marker([lat, lng])
                                        .addTo(map)
                                        .bindPopup("Start Location (Manual)")
                                        .openPopup();

                                    map.setView([lat, lng], 12);
                                }
                            }
                        }}
                        style={{
                            padding: '8px',
                            marginRight: '10px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            width: '250px'
                        }}
                    />

                    <UseCurrentLocation setStartCoord={setStartCoord} setManualInput={setManualInput} map={map} />

                    <button
                        onClick={generateOptimizedRoute}
                        disabled={!startCoord || selectedOutlets.length === 0 || isOptimizing}
                        style={{
                            padding: '8px 15px',
                            backgroundColor: (!startCoord || selectedOutlets.length === 0 || isOptimizing) ? '#6c757d' : '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            marginRight: '10px',
                            cursor: (!startCoord || selectedOutlets.length === 0 || isOptimizing) ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        {isOptimizing ? '🔄 Optimizing...' : '🚗 Generate Optimized Route'}
                    </button>

                    <button
                        onClick={downloadOptimizedRoute}
                        disabled={optimizedSequence.length === 0}
                        style={{
                            padding: '8px 15px',
                            backgroundColor: optimizedSequence.length === 0 ? '#6c757d' : '#ffc107',
                            color: optimizedSequence.length === 0 ? '#fff' : '#000',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: optimizedSequence.length === 0 ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        📊 Download Excel
                    </button>
                </div>
            </div>

            {optimizedSequence.length > 0 && (
                <div style={{
                    backgroundColor: '#d4edda',
                    padding: '15px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    border: '1px solid #c3e6cb',
                    color: '#155724'
                }}>
                    <h4 style={{ margin: '0 0 10px 0' }}>✅ Route Optimization Complete</h4>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        <span><strong>Outlets:</strong> {optimizedSequence.length}</span>
                        <span><strong>Distance:</strong> {routeDistance} km</span>
                        <span><strong>Duration:</strong> {routeDuration} minutes ({(routeDuration / 60).toFixed(1)} hours)</span>
                        <span><strong>Avg per Stop:</strong> {(routeDistance / Math.max(optimizedSequence.length, 1)).toFixed(1)} km</span>
                    </div>
                </div>
            )}

            <div
                id="map"
                ref={mapRef}
                style={{
                    height: "600px",
                    border: '2px solid #007bff',
                    borderRadius: '8px',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                }}
            />

            {isOptimizing && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        padding: '30px',
                        borderRadius: '10px',
                        textAlign: 'center',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                    }}>
                        <div style={{ fontSize: '24px', marginBottom: '15px' }}>🔄</div>
                        <h3 style={{ margin: '0 0 10px 0' }}>Optimizing Route...</h3>
                        <p style={{ margin: '0', color: '#666' }}>

                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RouteOptimizer;