const axios = require('axios');
const cheerio = require('cheerio');

const url = 'https://example.com';

axios
  .get(url)
  .then((response) => {
    const html = response.data;
    const $ = cheerio.load(html);
    console.log($('h1').text());
  })
  .catch(console.error);
