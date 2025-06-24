import React, { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import FileUploadHandler from './components/FileUploadHandler';
import BeatSelector from './components/BeatSelector';
import UseCurrentLocation from './components/UseCurrentLocation';
import RouteOptimizationService from './components/services/RouteOptimizationService';
import RouteDownloadService from './components/services/RouteDownloadService';


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
    const [routeService] = useState(() => new RouteOptimizationService());
    const [downloadService] = useState(() => new RouteDownloadService());


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



    // optimized route function in seprate component
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
            const result = await routeService.optimizeRoute(startCoord, selectedOutlets);

            // Update state with results
            setRouteDistance((result.distance / 1000).toFixed(2));
            setRouteDuration((result.duration / 60).toFixed(0));
            setOptimizedSequence(result.orderedOutlets);

            // Visualize on map
            routeService.visualizeRoute(
                map,
                result.geometry,
                result.orderedCoords,
                result.orderedOutlets,
                startCoord,
                result.selectedOption
            );

            console.log(`Route optimization completed using: ${result.selectedOption.name}`);

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
        downloadService.downloadOptimizedRoute(
            optimizedSequence,
            beatSelect,
            startCoord,
            routeDistance,
            routeDuration
        );
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