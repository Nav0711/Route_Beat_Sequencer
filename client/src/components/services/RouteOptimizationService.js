import axios from 'axios';
import L from 'leaflet';

// Route optimization algorithms
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

function buildFarthestInsertionRoute(distanceMatrix, n) {
    const visited = new Array(n + 1).fill(false);
    const route = [0];
    visited[0] = true;
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

function buildGeographicRoute(distanceMatrix, n) {
    const outlets = Array.from({ length: n }, (_, i) => i + 1);
    outlets.sort((a, b) => distanceMatrix[0][a] - distanceMatrix[0][b]);
    return [0, ...outlets];
}

function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000;
}

class RouteOptimizationService {
    constructor() {
        this.apiKey = import.meta.env.VITE_ORS_API_KEY;
    }

    optimizeSequenceFlow(route, distanceMatrix, outlets, startCoord, clusterRadius = 2000) {
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

    async getDistanceMatrix(coordinates) {
        const matrixCoords = coordinates.map(coord => [coord[1], coord[0]]);

        const response = await axios.post('https://api.openrouteservice.org/v2/matrix/driving-car', {
            locations: matrixCoords,
            metrics: ["distance", "duration"]
        }, {
            headers: {
                'Authorization': this.apiKey,
                'Content-Type': 'application/json'
            }
        });

        return {
            distances: response.data.distances,
            durations: response.data.durations
        };
    }

    async getRouteGeometry(coordinates) {
        const response = await axios.post('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
            coordinates: coordinates.map(coord => [coord[1], coord[0]])
        }, {
            headers: {
                'Authorization': this.apiKey,
                'Content-Type': 'application/json'
            }
        });

        return response.data.features[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
    }

    generateRouteOptions(distanceMatrix, durationMatrix, selectedOutlets, startCoord) {
        const n = selectedOutlets.length;

        // Generate multiple route options
        const nnRoute = buildNearestNeighborRoute(distanceMatrix, n);
        const option1 = twoOpt(nnRoute, distanceMatrix);

        const fiRoute = buildFarthestInsertionRoute(distanceMatrix, n);
        const option2 = twoOpt(fiRoute, distanceMatrix);

        const rnnRoute = buildRandomizedNearestNeighbor(distanceMatrix, n, 10);
        const option3 = twoOpt(rnnRoute, distanceMatrix);

        const geoRoute = buildGeographicRoute(distanceMatrix, n);
        const option4 = twoOpt(geoRoute, distanceMatrix);

        // Apply sequence flow optimization
        const sequenceOption1 = this.optimizeSequenceFlow(option1, distanceMatrix, selectedOutlets, startCoord, 1500);
        const sequenceOption2 = this.optimizeSequenceFlow(option2, distanceMatrix, selectedOutlets, startCoord, 2500);
        const sequenceOption3 = this.optimizeSequenceFlow(option3, distanceMatrix, selectedOutlets, startCoord, 3500);
        const sequenceOption4 = this.optimizeSequenceFlow(option4, distanceMatrix, selectedOutlets, startCoord, 2000);

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

        return routeOptions.sort((a, b) => a.distance - b.distance);
    }

    visualizeRoute(map, geometry, orderedCoords, orderedOutlets, startCoord, selectedOption) {
        // Clear existing layers
        map.eachLayer(layer => {
            if (layer instanceof L.Polyline || layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });

        // Add route polyline
        L.polyline(geometry, {
            color: '#007bff',
            weight: 5,
            opacity: 0.8,
            dashArray: '10, 5'
        }).addTo(map);

        // Group overlapping outlets
        const groupedMarkers = this.groupOverlappingMarkers(orderedCoords, orderedOutlets);

        // Visualize grouped markers
        this.addGroupedMarkers(map, groupedMarkers, startCoord, selectedOption);

        // Fit bounds
        const bounds = L.latLngBounds(geometry);
        map.fitBounds(bounds, { padding: [50, 50] });
    }

    groupOverlappingMarkers(orderedCoords, orderedOutlets) {
        const groupedMarkers = [];
        const OVERLAP_THRESHOLD = 50;

        orderedCoords.forEach((coord, index) => {
            const outlet = index > 0 ? orderedOutlets[index - 1] : null;
            let addedToGroup = false;

            for (let group of groupedMarkers) {
                const distance = calculateHaversineDistance(
                    coord[0], coord[1],
                    group.coord[0], group.coord[1]
                );

                if (distance <= OVERLAP_THRESHOLD) {
                    group.outlets.push({ index, outlet, coord });
                    addedToGroup = true;
                    break;
                }
            }

            if (!addedToGroup) {
                groupedMarkers.push({
                    coord: coord,
                    outlets: [{ index, outlet, coord }]
                });
            }
        });

        return groupedMarkers;
    }

    addGroupedMarkers(map, groupedMarkers, startCoord, selectedOption) {
        const getMarkerColor = (index) => {
            if (index === 0) return '#ff4757';
            const colors = ['#3742fa', '#2ed573', '#ffa502', '#ff6348', '#1e90ff', '#ff1493', '#32cd32', '#ff4500'];
            return colors[index % colors.length];
        };

        groupedMarkers.forEach(group => {
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

            const popupContent = this.createPopupContent(group, startCoord, selectedOption);
            L.marker(group.coord, { icon: customIcon }).addTo(map).bindPopup(popupContent);
        });
    }

    createPopupContent(group, startCoord, selectedOption) {
        if (group.outlets.length === 1) {
            const { index, outlet } = group.outlets[0];

            return index === 0
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
            // Multiple outlets popup content
            const startOutlet = group.outlets.find(o => o.index === 0);
            const regularOutlets = group.outlets.filter(o => o.index !== 0);

            let content = `<div style="min-width: 300px; max-height: 400px; overflow-y: auto;">`;

            if (startOutlet) {
                content += `
                    <h4 style="margin: 0 0 10px 0; color: #007bff;">🏁 Start Location</h4>
                    <p style="margin: 5px 0;"><strong>Coordinates:</strong> ${startCoord[0].toFixed(6)}, ${startCoord[1].toFixed(6)}</p>
                    <hr style="margin: 10px 0; border: 1px solid #eee;">
                `;
            }

            if (regularOutlets.length > 0) {
                content += `<h4 style="margin: 0 0 10px 0; color: #007bff;">📍 ${regularOutlets.length} Overlapping Stops</h4>`;

                regularOutlets.forEach(({ index, outlet }) => {
                    content += `
                        <div style="background: #f8f9fa; padding: 10px; margin: 5px 0; border-radius: 5px; border-left: 4px solid #007bff;">
                            <p style="margin: 0 0 5px 0; font-weight: bold;">Stop ${index}</p>
                            <p style="margin: 2px 0; font-size: 13px;"><strong>Outlet ID:</strong> ${outlet?.outlet}</p>
                            <p style="margin: 2px 0; font-size: 13px;"><strong>Name:</strong> ${outlet?.outletName || 'N/A'}</p>
                            <p style="margin: 2px 0; font-size: 13px;"><strong>Coordinates:</strong> ${outlet?.lat.toFixed(6)}, ${outlet?.lng.toFixed(6)}</p>
                        </div>
                    `;
                });
            }

            content += `
                <p style="margin: 10px 0 0 0; color: #28a745; font-size: 12px; text-align: center;">✓ ${selectedOption.name}</p>
                </div>
            `;

            return content;
        }
    }

    async optimizeRoute(startCoord, selectedOutlets) {
        console.log("Starting enhanced route optimization with multiple options...");
        console.log("Start coordinates:", startCoord);
        console.log("Number of outlets:", selectedOutlets.length);

        // Prepare coordinates
        const allCoords = [startCoord, ...selectedOutlets.map(outlet => [outlet.lat, outlet.lng])];

        // Get distance matrix
        console.log("Getting distance matrix...");
        const { distances: distanceMatrix, durations: durationMatrix } = await this.getDistanceMatrix(allCoords);

        // Generate route options
        const routeOptions = this.generateRouteOptions(distanceMatrix, durationMatrix, selectedOutlets, startCoord);

        // By default, select the first (best) option
        const selectedOption = routeOptions[0];
        const finalRoute = selectedOption.route;
        const orderedOutlets = finalRoute.slice(1).map(i => selectedOutlets[i - 1]);
        const orderedCoords = [startCoord, ...orderedOutlets.map(outlet => [outlet.lat, outlet.lng])];

        // Get route geometry for the default option
        console.log("Getting route geometry...");
        const geometry = await this.getRouteGeometry(orderedCoords);
        
        return {
            routeOptions,
            selectedOption,
            orderedOutlets,
            orderedCoords,
            geometry,
            distance: selectedOption.distance,
            duration: selectedOption.duration
        };
    }
}

export default RouteOptimizationService;