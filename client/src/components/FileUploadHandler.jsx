import React from 'react';
import * as ExcelJS from 'exceljs';

const FileUploadHandler = ({ onDataParsed, selectedOutletsCount }) => {
    const handleFile = async (e) => {
        const file = e.target.files[0];
        if (!file) {
            onDataParsed({});
            return;
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(arrayBuffer);
            
            const worksheet = workbook.getWorksheet(1); // Get first worksheet
            
            if (!worksheet) {
                alert('No worksheet found in the file.');
                onDataParsed({});
                return;
            }

            const jsonData = [];
            const headers = [];
            
            // Get headers from first row
            const firstRow = worksheet.getRow(1);
            firstRow.eachCell((cell, colNumber) => {
                headers[colNumber] = cell.value;
            });

            // Process data rows
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header row
                
                const rowData = {};
                row.eachCell((cell, colNumber) => {
                    if (headers[colNumber]) {
                        rowData[headers[colNumber]] = cell.value;
                    }
                });
                
                // Only add rows that have data
                if (Object.keys(rowData).length > 0) {
                    jsonData.push(rowData);
                }
            });

            const parsed = {};
            jsonData.forEach(row => {
                const beat = row['Beat Name'] || row['Beat'] || row['beat'];
                const outlet = row['Outlet ID'] || row['Outlet: Outlet Id'];
                const lat = row['Latitude'] || row['lat'];
                const lng = row['Longitude'] || row['lng'];
                const outletName = row['Outlet Name'] || row['Outlet: Account Name'] || row['Outlet:Account Name'];

                if (!beat || !outlet || !lat || !lng) return;
                if (!parsed[beat]) parsed[beat] = [];

                // Only add if not already present (by Outlet ID)
                if (!parsed[beat].some(o => o.outlet === outlet)) {
                    parsed[beat].push({
                        outlet,
                        lat: parseFloat(lat),
                        lng: parseFloat(lng),
                        outletName: outletName || 'N/A'
                    });
                }
            });

            onDataParsed(parsed);
        } catch (error) {
            console.error('Error parsing file:', error);
            alert('Error parsing file. Please check the file format.');
            onDataParsed({});
        }
    };

    return (
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
            {selectedOutletsCount > 0 && (
                <span style={{ color: '#28a745', fontWeight: 'bold' }}>
                    {selectedOutletsCount} outlets loaded
                </span>
            )}
        </div>
    );
};

export default FileUploadHandler;