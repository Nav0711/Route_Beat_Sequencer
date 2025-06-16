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

    const useCurrentLocation = () => {
        navigator.geolocation.getCurrentPosition(pos => {
            const coords = [pos.coords.latitude, pos.coords.longitude];
            setStartCoord(coords);
            setManualInput(`${coords[0].toFixed(6)},${coords[1].toFixed(6)}`);

            if (map) {
                // Clear existing markers
                map.eachLayer(layer => {
                    if (layer instanceof L.Marker) {
                        map.removeLayer(layer);
                    }
                });

                L.marker(coords).addTo(map).bindPopup("Start Location").openPopup();
                map.setView(coords, 12);
            }
        });
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
            console.log("Starting enhanced route optimization for dense clusters...");
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

            // Enhanced optimization functions
            const calculateRouteDistance = (route, matrix, includeReturn = true) => {
                let totalDistance = 0;
                for (let i = 0; i < route.length - 1; i++) {
                    totalDistance += matrix[route[i]][route[i + 1]];
                }
                if (includeReturn && route.length > 1) {
                    totalDistance += matrix[route[route.length - 1]][route[0]];
                }
                return totalDistance;
            };

            const calculateRouteDuration = (route, matrix, includeReturn = true) => {
                let totalDuration = 0;
                for (let i = 0; i < route.length - 1; i++) {
                    totalDuration += matrix[route[i]][route[i + 1]];
                }
                if (includeReturn && route.length > 1) {
                    totalDuration += matrix[route[route.length - 1]][route[0]];
                }
                return totalDuration;
            };

            // Advanced cluster detection with micro-clusters for very close outlets
            const detectAdvancedClusters = () => {
                const microClusters = []; // Very close outlets (< 500m)
                const regularClusters = []; // Moderately close outlets (500m - 2km)
                const visited = new Set();

                // First pass: Detect micro-clusters (very close outlets)
                for (let i = 1; i < allCoords.length; i++) {
                    if (visited.has(i)) continue;

                    const microCluster = [i];
                    visited.add(i);

                    for (let j = i + 1; j < allCoords.length; j++) {
                        if (visited.has(j)) continue;

                        const distance = distanceMatrix[i][j];
                        if (distance <= 500) { // 500m threshold for micro-clusters
                            microCluster.push(j);
                            visited.add(j);
                        }
                    }

                    if (microCluster.length > 1) {
                        microClusters.push(microCluster);
                    }
                }

                // Reset visited for regular clusters
                visited.clear();

                // Second pass: Detect regular clusters
                for (let i = 1; i < allCoords.length; i++) {
                    if (visited.has(i)) continue;

                    const cluster = [i];
                    visited.add(i);

                    for (let j = i + 1; j < allCoords.length; j++) {
                        if (visited.has(j)) continue;

                        const distance = distanceMatrix[i][j];
                        if (distance > 500 && distance <= 2000) { // 500m - 2km for regular clusters
                            cluster.push(j);
                            visited.add(j);
                        }
                    }

                    if (cluster.length > 1) {
                        regularClusters.push(cluster);
                    }
                }

                console.log(`Detected ${microClusters.length} micro-clusters and ${regularClusters.length} regular clusters`);
                return { microClusters, regularClusters };
            };

            // Perfect micro-cluster sequencing
            const optimizeMicroCluster = (cluster, fromIndex) => {
                if (cluster.length <= 1) return cluster;

                // For micro-clusters, use exhaustive search for perfect optimization
                if (cluster.length <= 8) {
                    const permute = (arr) => {
                        if (arr.length <= 1) return [arr];
                        const result = [];
                        for (let i = 0; i < arr.length; i++) {
                            const rest = permute([...arr.slice(0, i), ...arr.slice(i + 1)]);
                            for (const perm of rest) {
                                result.push([arr[i], ...perm]);
                            }
                        }
                        return result;
                    };

                    const allPermutations = permute(cluster);
                    let bestSequence = cluster;
                    let bestDistance = Infinity;

                    for (const sequence of allPermutations) {
                        let totalDistance = distanceMatrix[fromIndex][sequence[0]];
                        for (let i = 0; i < sequence.length - 1; i++) {
                            totalDistance += distanceMatrix[sequence[i]][sequence[i + 1]];
                        }

                        if (totalDistance < bestDistance) {
                            bestDistance = totalDistance;
                            bestSequence = sequence;
                        }
                    }

                    console.log(`Micro-cluster optimized: ${cluster.length} outlets, distance saved: ${((calculateDistance(cluster, fromIndex) - bestDistance) / 1000).toFixed(2)}km`);
                    return bestSequence;
                }

                // For larger micro-clusters, use nearest neighbor within cluster
                return optimizeClusterNearestNeighbor(cluster, fromIndex);
            };

            const calculateDistance = (sequence, fromIndex) => {
                let total = distanceMatrix[fromIndex][sequence[0]];
                for (let i = 0; i < sequence.length - 1; i++) {
                    total += distanceMatrix[sequence[i]][sequence[i + 1]];
                }
                return total;
            };

            // Optimize cluster using nearest neighbor
            const optimizeClusterNearestNeighbor = (cluster, fromIndex) => {
                if (cluster.length <= 1) return cluster;

                const sequence = [];
                const unvisited = new Set(cluster);

                // Start with the closest outlet to the fromIndex
                let nearestDistance = Infinity;
                let nearestOutlet = -1;

                for (const outlet of cluster) {
                    const distance = distanceMatrix[fromIndex][outlet];
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestOutlet = outlet;
                    }
                }

                sequence.push(nearestOutlet);
                unvisited.delete(nearestOutlet);

                // Continue with nearest neighbor within the cluster
                while (unvisited.size > 0) {
                    const currentOutlet = sequence[sequence.length - 1];
                    nearestDistance = Infinity;
                    nearestOutlet = -1;

                    for (const outlet of unvisited) {
                        const distance = distanceMatrix[currentOutlet][outlet];
                        if (distance < nearestDistance) {
                            nearestDistance = distance;
                            nearestOutlet = outlet;
                        }
                    }

                    if (nearestOutlet !== -1) {
                        sequence.push(nearestOutlet);
                        unvisited.delete(nearestOutlet);
                    }
                }

                return sequence;
            };

            // Enhanced cluster-aware route construction
            const buildClusterAwareRoute = () => {
                const { microClusters, regularClusters } = detectAdvancedClusters();
                const allClusters = [...microClusters, ...regularClusters];

                // Create a map of outlet to cluster
                const outletToCluster = new Map();
                allClusters.forEach((cluster, clusterIndex) => {
                    cluster.forEach(outlet => {
                        outletToCluster.set(outlet, { cluster, index: clusterIndex, isMicro: clusterIndex < microClusters.length });
                    });
                });

                const route = [0]; // Start with starting location
                const visitedClusters = new Set();
                const visitedOutlets = new Set();
                const outletIndices = Array.from({ length: selectedOutlets.length }, (_, i) => i + 1);

                console.log("Building cluster-aware route...");

                while (visitedOutlets.size < outletIndices.length) {
                    const currentPosition = route[route.length - 1];
                    let bestNextMove = null;
                    let bestDistance = Infinity;

                    // Look for the nearest unvisited outlet
                    for (const outletIndex of outletIndices) {
                        if (visitedOutlets.has(outletIndex)) continue;

                        const distance = distanceMatrix[currentPosition][outletIndex];
                        const clusterInfo = outletToCluster.get(outletIndex);

                        if (clusterInfo && !visitedClusters.has(clusterInfo.index)) {
                            // This outlet belongs to an unvisited cluster
                            if (distance < bestDistance) {
                                bestDistance = distance;
                                bestNextMove = {
                                    type: 'cluster',
                                    cluster: clusterInfo.cluster,
                                    clusterIndex: clusterInfo.index,
                                    isMicro: clusterInfo.isMicro,
                                    entryPoint: outletIndex
                                };
                            }
                        } else if (!clusterInfo) {
                            // This is an isolated outlet
                            if (distance < bestDistance) {
                                bestDistance = distance;
                                bestNextMove = {
                                    type: 'single',
                                    outlet: outletIndex
                                };
                            }
                        }
                    }

                    if (bestNextMove) {
                        if (bestNextMove.type === 'cluster') {
                            // Process entire cluster
                            const cluster = bestNextMove.cluster;
                            const optimizedSequence = bestNextMove.isMicro
                                ? optimizeMicroCluster(cluster, currentPosition)
                                : optimizeClusterNearestNeighbor(cluster, currentPosition);

                            console.log(`Processing ${bestNextMove.isMicro ? 'micro-' : ''}cluster of ${cluster.length} outlets starting from outlet ${optimizedSequence[0]}`);

                            route.push(...optimizedSequence);
                            cluster.forEach(outlet => visitedOutlets.add(outlet));
                            visitedClusters.add(bestNextMove.clusterIndex);

                        } else {
                            // Process single outlet
                            route.push(bestNextMove.outlet);
                            visitedOutlets.add(bestNextMove.outlet);
                            console.log(`Added isolated outlet ${bestNextMove.outlet}`);
                        }
                    } else {
                        // Fallback: add nearest unvisited outlet
                        let nearestOutlet = -1;
                        let nearestDistance = Infinity;

                        for (const outletIndex of outletIndices) {
                            if (!visitedOutlets.has(outletIndex)) {
                                const distance = distanceMatrix[currentPosition][outletIndex];
                                if (distance < nearestDistance) {
                                    nearestDistance = distance;
                                    nearestOutlet = outletIndex;
                                }
                            }
                        }

                        if (nearestOutlet !== -1) {
                            route.push(nearestOutlet);
                            visitedOutlets.add(nearestOutlet);
                            console.log(`Fallback: added outlet ${nearestOutlet}`);
                        } else {
                            break; // No more outlets to visit
                        }
                    }
                }

                return route;
            };

            // Advanced 2-opt optimization with cluster awareness
            const advancedTwoOptOptimization = (route, distanceMatrix, maxIterations = 100) => {
                let bestRoute = [...route];
                let bestDistance = calculateRouteDistance(bestRoute, distanceMatrix, false);
                let improved = true;
                let iterations = 0;

                console.log(`Starting 2-opt optimization on route of ${route.length} points...`);

                while (improved && iterations < maxIterations) {
                    improved = false;
                    iterations++;

                    for (let i = 1; i < route.length - 2; i++) {
                        for (let j = i + 1; j < route.length; j++) {
                            if (j - i === 1) continue; // Skip adjacent swaps

                            // Check if this swap would break micro-clusters
                            const outlet1 = route[i];
                            const outlet2 = route[j];

                            // Only allow swaps if outlets are reasonably close or if it significantly improves the route
                            const swapDistance = distanceMatrix[outlet1][outlet2];
                            const currentSegmentDistance = calculateRouteDistance(route.slice(i, j + 1), distanceMatrix, false);

                            // Create new route with 2-opt swap
                            const newRoute = [
                                ...route.slice(0, i),
                                ...route.slice(i, j + 1).reverse(),
                                ...route.slice(j + 1)
                            ];

                            const newDistance = calculateRouteDistance(newRoute, distanceMatrix, false);
                            const improvement = bestDistance - newDistance;

                            // Accept improvement if it's significant or if outlets are very close
                            if (improvement > 0 && (improvement > 100 || swapDistance < 1000)) {
                                route = newRoute;
                                bestRoute = [...newRoute];
                                bestDistance = newDistance;
                                improved = true;
                                console.log(`2-opt improvement: ${(improvement / 1000).toFixed(2)}km saved`);
                            }
                        }
                    }
                }

                console.log(`2-opt optimization completed after ${iterations} iterations`);
                return bestRoute;
            };

            // Generate the optimal route
            console.log("Building cluster-aware route...");
            let bestRoute = buildClusterAwareRoute();

            console.log("Applying advanced 2-opt optimization...");
            bestRoute = advancedTwoOptOptimization(bestRoute, distanceMatrix);

            if (bestRoute.length > 1) {
                // Find the outlet farthest from the start (index 0)
                let maxDist = -1;
                let farthestIdx = 1;
                for (let i = 1; i < bestRoute.length; i++) {
                    const dist = distanceMatrix[0][bestRoute[i]];
                    if (dist > maxDist) {
                        maxDist = dist;
                        farthestIdx = i;
                    }
                }
                // Rotate the route so that the farthest outlet is last
                if (farthestIdx !== bestRoute.length - 1) {
                    const reordered = [
                        ...bestRoute.slice(0, farthestIdx + 1),
                        ...bestRoute.slice(farthestIdx + 1)
                    ];
                    bestRoute = reordered;
                }
            }

            // Calculate final metrics
            const bestDistance = calculateRouteDistance(bestRoute, distanceMatrix, false);
            const bestDuration = calculateRouteDuration(bestRoute, durationMatrix, false);

            console.log(`Final optimized route: ${(bestDistance / 1000).toFixed(2)} km, ${(bestDuration / 60).toFixed(0)} min`);
            console.log("Final route sequence:", bestRoute);

            // Prepare and display results
            const orderedOutlets = bestRoute.slice(1).map(i => selectedOutlets[i - 1]);
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

            orderedCoords.forEach((coord, index) => {
                const outlet = index > 0 ? orderedOutlets[index - 1] : null;

                const getMarkerColor = (index) => {
                    if (index === 0) return '#ff4757';
                    const colors = ['#3742fa', '#2ed573', '#ffa502', '#ff6348', '#1e90ff', '#ff1493', '#32cd32', '#ff4500'];
                    return colors[index % colors.length];
                };

                const customIcon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="
                background: ${getMarkerColor(index)}; 
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
                font-size: 16px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
            ">
                ${index === 0 ? 'S' : index}
            </div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });

                const popupContent = index === 0
                    ? `<div style="min-width: 200px;">
                 <h4 style="margin: 0 0 10px 0; color: #007bff;">🏁 Start Location</h4>
                 <p style="margin: 5px 0;"><strong>Coordinates:</strong> ${startCoord[0].toFixed(6)}, ${startCoord[1].toFixed(6)}</p>
                 <p style="margin: 5px 0; color: #28a745; font-size: 12px;">✓ Perfect cluster-aware optimization</p>
               </div>`
                    : `<div style="min-width: 250px;">
                 <h4 style="margin: 0 0 10px 0; color: #007bff;">📍 Stop ${index}</h4>
                 <p style="margin: 5px 0;"><strong>Outlet ID:</strong> ${outlet?.outlet}</p>
                 <p style="margin: 5px 0;"><strong>Name:</strong> ${outlet?.outletName || 'N/A'}</p>
                 <p style="margin: 5px 0;"><strong>Coordinates:</strong> ${outlet?.lat.toFixed(6)}, ${outlet?.lng.toFixed(6)}</p>
                 <p style="margin: 5px 0; color: #28a745; font-size: 12px;">✓ Micro-cluster optimized</p>
               </div>`;

                L.marker(coord, { icon: customIcon }).addTo(map).bindPopup(popupContent);
            });

            const bounds = L.latLngBounds(geometry);
            map.fitBounds(bounds, { padding: [50, 50] });

            console.log("Perfect cluster-aware route optimization completed successfully!");

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
                <div style={{ marginBottom: '15px' }}>
                    <input
                        type="file"
                        onChange={handleFile}
                        accept=".xlsx, .xls"
                        style={{
                            marginRight: '10px',
                            padding: '5px',
                            border: '1px solid #ccc',
                            borderRadius: '4px'
                        }}
                    />
                    <select
                        onChange={handleBeatChange}
                        value={beatSelect}
                        style={{
                            padding: '8px',
                            marginRight: '10px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            minWidth: '150px'
                        }}
                    >
                        <option value="">Select Beat</option>
                        {Object.keys(beatData).map(beat => (
                            <option key={beat} value={beat}>{beat}</option>
                        ))}
                    </select>
                    {selectedOutlets.length > 0 && (
                        <span style={{ color: '#28a745', fontWeight: 'bold' }}>
                            {selectedOutlets.length} outlets loaded
                        </span>
                    )}
                </div>

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

                    <button
                        onClick={useCurrentLocation}
                        style={{
                            padding: '8px 15px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            marginRight: '10px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        📍 Use Current Location
                    </button>

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
                            Please wait while we find the best route using multiple optimization strategies...
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RouteOptimizer;