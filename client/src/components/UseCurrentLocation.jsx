import React from 'react';

function UseCurrentLocation({ setStartCoord, setManualInput, map }) {
    const handleClick = () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                setStartCoord(coords);
                setManualInput(`${coords[0].toFixed(6)},${coords[1].toFixed(6)}`);

                if (map && window.L) {
                    map.eachLayer(layer => {
                        if (layer instanceof window.L.Marker) {
                            map.removeLayer(layer);
                        }
                    });
                    window.L.marker(coords).addTo(map).bindPopup("Start Location").openPopup();
                    map.setView(coords, 12);
                }
            },
            err => {
                alert("Failed to get location: " + err.message);
            }
        );
    };

    return (
        <button
            onClick={handleClick}
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
    );
}

export default UseCurrentLocation;