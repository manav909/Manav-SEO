import React, { useState } from 'react';

const SeoEngine = () => {
    const [url, setUrl] = useState('');
    const [keyword, setKeyword] = useState('');
    const [deliverableType, setDeliverableType] = useState('');
    const [targetCountry, setTargetCountry] = useState('');
    const [target, setTarget] = useState('');

    const targets = ['traffic', 'ranking', 'conversions', 'engagement'];

    const handleGenerate = () => {
        if (!url || !keyword || !deliverableType || !targetCountry || !target) {
            alert('Please fill in all fields including Target Country and Target Objective.');
            return;
        }

        const requestData = {
            url,
            keyword,
            deliverableType,
            targetCountry,
            target
        };

        // Replace with actual API call
        // apiCall(requestData);
    };

    return (
        <div>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enter URL" />
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Enter Keyword" />
            <input type="text" value={deliverableType} onChange={(e) => setDeliverableType(e.target.value)} placeholder="Enter Deliverable Type" />

            <input type="text" value={targetCountry} onChange={(e) => setTargetCountry(e.target.value)} placeholder="Target Country" />
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Select Target Objective</option>
                {targets.map((t) => (
                    <option key={t} value={t}>{t}</option>
                ))}
            </select>

            <button onClick={handleGenerate}>Generate</button>
        </div>
    );
};

export default SeoEngine;