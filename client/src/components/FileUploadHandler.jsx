import React from 'react';
import * as XLSX from 'xlsx';

const FileUploadHandler = ({ onDataParsed, selectedOutletsCount }) => {
    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file) {
            onDataParsed({});
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
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
        
        reader.onerror = () => {
            console.error('Error reading file');
            alert('Error reading file. Please try again.');
            onDataParsed({});
        };

        reader.readAsArrayBuffer(file);
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