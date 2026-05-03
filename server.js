const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Session-based cache
const cache = new Map();

// Function to crawl website and extract data
async function crawlWebsite(url) {
    if (cache.has(url)) {
        return cache.get(url);
    }
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        const title = $('title').text();
        const metaDescription = $('meta[name="description"]').attr('content');
        const headings = [];
        $('h1, h2, h3').each((i, el) => headings.push($(el).text()));
        const links = [];
        $('a').each((i, el) => links.push($(el).attr('href')));
        const images = [];
        $('img').each((i, el) => images.push($(el).attr('src')));
        const bodyText = $('body').text();

        const crawledData = { title, metaDescription, headings, links, images, bodyText };
        cache.set(url, crawledData);
        return crawledData;
    } catch (error) {
        throw new Error('Error while crawling the website');
    }
}

// Endpoint to analyze SEO
app.post('/api/seo-agent', async (req, res) => {
    const { url, keyword, targetCountry, target } = req.body;

    const validTargets = ['traffic', 'ranking', 'conversions', 'engagement', 'visibility', 'authority'];

    if (!targetCountry || !target || !url || !keyword) {
        return res.status(400).json({ error: 'targetCountry, target, url, and keyword are required fields.' });
    }
    if (!validTargets.includes(target)) {
        return res.status(400).json({ error: 'Invalid target provided.' });
    }

    try {
        const crawledData = await crawlWebsite(url);
        // Include crawled data in user message sent to Claude API
        const userMessage = `Analyze ${keyword} for the website data: ${JSON.stringify(crawledData)}`;
        // Call Claude API with all fields
        // const response = await ClaudeAPI.call({ url, keyword, targetCountry, target, crawledData });

        res.status(200).json({ message: 'SEO analysis requested', crawledData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to get cache status
app.get('/api/cache-status', (req, res) => {
    res.status(200).json({ cache: Array.from(cache.entries()) });
});

// Endpoint to clear the cache
app.post('/api/clear-cache', (req, res) => {
    cache.clear();
    res.status(200).json({ message: 'Cache cleared successfully.' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});