import ExcelJS from 'exceljs';

class RouteDownloadService {
  async downloadOptimizedRoute(optimizedSequence, beatSelect, startCoord, routeDistance, routeDuration) {
    if (optimizedSequence.length === 0) {
      alert("No optimized route available. Please generate a route first.");
      return;
    }

    const workbook = new ExcelJS.Workbook();

    // 1. Route Details Sheet
    const routeSheet = workbook.addWorksheet('Route Details');

    // Define columns
    routeSheet.columns = [
      { header: 'Sequence', key: 'sequence', width: 10 },
      { header: 'Outlet ID', key: 'outletId', width: 15 },
      { header: 'Outlet Name', key: 'outletName', width: 25 },
      { header: 'Beat Name', key: 'beatName', width: 15 },
      { header: 'Latitude', key: 'latitude', width: 12 },
      { header: 'Longitude', key: 'longitude', width: 12 },
      { header: 'Visit Order', key: 'visitOrder', width: 15 },
      { header: 'Notes', key: 'notes', width: 30 }
    ];

    // Add starting point
    routeSheet.addRow({
      sequence: 0,
      outletId: 'START',
      outletName: 'Start Location',
      beatName: beatSelect,
      latitude: startCoord[0],
      longitude: startCoord[1],
      visitOrder: 'Starting Point',
      notes: 'Begin route from this location'
    });

    // Add optimized stops
    optimizedSequence.forEach((outlet, index) => {
      routeSheet.addRow({
        sequence: index + 1,
        outletId: outlet.outlet,
        outletName: outlet.outletName,
        beatName: beatSelect,
        latitude: outlet.lat,
        longitude: outlet.lng,
        visitOrder: `Stop ${index + 1}`,
        notes: 'Optimized using enhanced 2-opt algorithm'
      });
    });

    // 2. Summary Sheet
    const summarySheet = workbook.addWorksheet('Summary');

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

    summaryData.forEach(row => summarySheet.addRow(row));
    summarySheet.columns = [
      { width: 35 },
      { width: 25 }
    ];

    // 3. Trigger download (frontend only)
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `Enhanced_Route_${beatSelect}_${timestamp}.xlsx`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export default RouteDownloadService;
