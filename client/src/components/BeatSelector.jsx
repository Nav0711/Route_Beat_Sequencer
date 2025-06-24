import React from 'react';

const BeatSelector = ({
    beatData,
    selectedBeat,
    onBeatChange,
    selectedOutletsCount,
    disabled = false
}) => {
    const handleBeatSelection = (e) => {
        const beat = e.target.value;
        const outlets = beatData[beat] || [];
        onBeatChange(beat, outlets);
    };

    const beatOptions = Object.keys(beatData || {});
    const hasBeats = beatOptions.length > 0;

    return (
        <div style={{ marginBottom: '15px' }}>
            <select
                onChange={handleBeatSelection}
                value={selectedBeat}
                disabled={disabled || !hasBeats}
                style={{
                    padding: '8px',
                    marginRight: '10px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    minWidth: '200px',
                    backgroundColor: disabled || !hasBeats ? '#f8f9fa' : 'white',
                    cursor: disabled || !hasBeats ? 'not-allowed' : 'pointer',
                    color: disabled || !hasBeats ? '#6c757d' : '#333'
                }}
            >
                <option value="">
                    {!hasBeats ? 'Upload file first' : 'Select Beat'}
                </option>
                {beatOptions.map(beat => (
                    <option key={beat} value={beat}>
                        {beat} ({beatData[beat]?.length || 0} outlets)
                    </option>
                ))}
            </select>

            {selectedBeat && selectedOutletsCount > 0 && (
                <span style={{
                    color: '#28a745',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    marginLeft: '10px',
                    padding: '4px 8px',
                    backgroundColor: '#d4edda',
                    borderRadius: '4px',
                    border: '1px solid #c3e6cb'
                }}>
                    ✓ {selectedOutletsCount} outlets loaded from "{selectedBeat}"
                </span>
            )}

            {!hasBeats && (
                <span style={{
                    color: '#ffc107',
                    fontStyle: 'italic',
                    fontSize: '12px',
                    marginLeft: '10px'
                }}>
                    Please upload an Excel file to see available beats
                </span>
            )}
        </div>
    );
};

export default BeatSelector;