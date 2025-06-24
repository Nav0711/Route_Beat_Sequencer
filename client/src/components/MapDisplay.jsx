import React, { useRef, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const MapDisplay = ({ map, setMap, startCoord }) => {
    const mapRef = useRef(null);

    useEffect(() => {
        if (!mapRef.current) return;
        if (mapRef.current._leaflet_id != null) return;

        const m = L.map(mapRef.current).setView([28.6139, 77.2090], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
        }).addTo(m);
        setMap(m);

        return () => {
            m.remove();
        };
    }, [setMap]);

    // Optionally, update start marker if startCoord changes
    useEffect(() => {
        if (map && startCoord) {
            map.eachLayer(layer => {
                if (layer instanceof L.Marker) map.removeLayer(layer);
            });
            L.marker(startCoord).addTo(map).bindPopup("Start Location").openPopup();
            map.setView(startCoord, 12);
        }
    }, [map, startCoord]);

    return (
        <div
            ref={mapRef}
            style={{
                height: "600px",
                border: '2px solid #007bff',
                borderRadius: '8px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
            }}
        />
    );
};

export default MapDisplay;