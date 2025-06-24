import * as XLSX from 'xlsx';

class RouteDownloadService {
    downloadOptimizedRoute(optimizedSequence, beatSelect, startCoord, routeDistance, routeDuration) {
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
    }
}

export default RouteDownloadService;