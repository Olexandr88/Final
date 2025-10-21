const axios = require('axios');
const cheerio = require('cheerio');

const url = process.argv[2] || 'https://example.com';

console.log(`Scraping URL: ${url}`);

axios.get(url)
  .then(response => {
    const html = response.data;
    const $ = cheerio.load(html);
    const links = [];
    $('a').each((i, elem) => {
      links.push($(elem).attr('href'));
    });
    console.log('Links:', links);
  })
  .catch(console.error);
