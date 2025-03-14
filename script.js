/*
  script.js

  A user-friendly front-end for exporting Reddit post data
  (comments, scores, metadata) to CSV or HTML for further analysis.
*/

let http = new XMLHttpRequest();
let tableData = [];     
let tableBuilt = false;

// User preferences
let selectedDateFormat = 'iso8601'; // iso8601 | rfc1123 | utc
let isCompactMode = false;
let removeNewlines = false;

// We'll store info about the post itself
let postInfo = null;

function onDocumentReady() {
  const preFilledUrl = getQueryParamUrl();
  if (preFilledUrl) {
    document.getElementById('url-field').value = preFilledUrl;
    startExport();
  }
}

// Get 'url' query param if present
function getQueryParamUrl() {
  return new URLSearchParams(window.location.search).get('url') ?? null;
}

// Grab the text field value
function getFieldUrl() {
  return document.getElementById('url-field').value.trim();
}

// Start the fetch-and-render process
function startExport() {
  const url = getFieldUrl();
  if (!url) {
    console.log('No URL provided');
    alert('Please enter a valid Reddit post URL before exporting.');
    return;
  }

  // Read user preferences
  selectedDateFormat = document.querySelector('input[name="dateFormat"]:checked').value;
  isCompactMode = document.getElementById('compactMode').checked;
  removeNewlines = document.getElementById('escapeNewLine').checked;

  // Reset data
  tableData = [];
  tableBuilt = false;
  postInfo = null;

  fetchData(url);
}

// Fetch Reddit JSON by appending .json
function fetchData(url) {
  http.open('GET', url + '.json');
  http.responseType = 'json';
  http.send();

  http.onload = function () {
    const response = http.response;
    if (!response || response.error) {
      console.error('Error fetching Reddit JSON', response);
      alert('Error: Could not retrieve data from Reddit. Please check the URL.');
      return;
    }

    // The first array (response[0]) has post info
    const post = response[0].data.children[0].data;
    postInfo = extractPostInfo(post);

    // The second array (response[1]) has the comments
    const comments = response[1].data.children;
    buildTableData(comments, []);

    // Render UI elements
    renderPostInfo(postInfo);
    renderTable(tableData);

    // Enable Copy/Download
    document.getElementById('download-btn').disabled = false;
    document.getElementById('copy-btn').disabled = false;
  };
}

// Extract relevant post fields
function extractPostInfo(p) {
  return {
    title: p.title || '',
    selftext: p.selftext || '',
    author: p.author || '[deleted]',
    permalink: p.permalink || '',
    ups: p.ups || 0,
    downs: p.downs || 0,
    score: (typeof p.score === 'number') ? p.score : (p.ups - p.downs),
    dateUtc: p.created_utc || null
  };
}

// Recursively process the comment tree
function buildTableData(comments, prefixArr) {
  if (!comments || !comments.length) return;

  let count = 0;
  comments.forEach(child => {
    if (child.kind === 'more') {
      return; 
    }

    let c = child.data;
    count++;
    let numberingArray = [...prefixArr, count];
    let numberingString = numberingArray.join('.');

    const row = {
      numbering: numberingString,
      level: numberingArray.length,
      body: c.body ? c.body : '[deleted]',
      author: c.author ? c.author : '[deleted]',
      upvotes: c.ups || 0,
      downvotes: c.downs || 0,
      score: (typeof c.score === 'number') ? c.score : (c.ups - c.downs),
      dateUtc: c.created_utc ? c.created_utc : null
    };

    tableData.push(row);

    // Recurse for replies
    if (c.replies && c.replies.data && c.replies.data.children) {
      buildTableData(c.replies.data.children, numberingArray);
    }
  });
}

// Format the date in UTC
function formatDate(utcSeconds) {
  if (!utcSeconds) return '';
  const d = new Date(utcSeconds * 1000); 
  switch (selectedDateFormat) {
    case 'iso8601':
      return formatUTCAsISO8601(d);
    case 'rfc1123':
      return d.toUTCString();
    case 'utc':
      return formatUTCAsSimple(d);
    default:
      return d.toISOString();
  }
}

// For ISO 8601 style: 2025-03-11T14:19:10+00:00
function formatUTCAsISO8601(dateObj) {
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const hours = String(dateObj.getUTCHours()).padStart(2, '0');
  const mins = String(dateObj.getUTCMinutes()).padStart(2, '0');
  const secs = String(dateObj.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}:${secs}+00:00`;
}

// For simple UTC style: 2025-03-11T14:19:10Z
function formatUTCAsSimple(dateObj) {
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const hours = String(dateObj.getUTCHours()).padStart(2, '0');
  const mins = String(dateObj.getUTCMinutes()).padStart(2, '0');
  const secs = String(dateObj.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}:${secs}Z`;
}

// Render the Post Info section
function renderPostInfo(post) {
  const block = document.getElementById('post-info-block');
  block.classList.remove('hidden');
  const postDate = formatDate(post.dateUtc);

  let html = `
    <p><strong>Title:</strong> ${escapeHtml(post.title)}</p>
    <p><strong>Author:</strong> ${escapeHtml(post.author)}</p>
    <p><strong>Date (UTC):</strong> ${escapeHtml(postDate)}</p>
    <p><strong>Upvotes:</strong> ${post.ups}</p>
    <p><strong>Downvotes:</strong> ${post.downs}</p>
    <p><strong>Score:</strong> ${post.score}</p>
    <p><strong>Permalink:</strong> 
      <a href="https://www.reddit.com${post.permalink}" target="_blank">View Post</a>
    </p>
  `;
  if (post.selftext) {
    html += `
      <p><strong>Self Text:</strong></p>
      <pre>${escapeHtml(post.selftext)}</pre>
    `;
  }
  document.getElementById('post-info').innerHTML = html;
}

// Convert the comment body to HTML with/without line breaks
function formatBodyForHtml(str) {
  if (removeNewlines) {
    return escapeHtml(str.replace(/\r?\n|\n\r|\n|\r/g, ' '));
  } else {
    // Convert newlines to <br>
    return str
      .split(/\r?\n|\n\r|\n|\r/g)
      .map(part => escapeHtml(part))
      .join('<br>');
  }
}

// Render the comments table
function renderTable(data) {
  document.getElementById('output-block').classList.remove('hidden');
  const tableWrapper = document.getElementById('table-wrapper');

  let html = '';
  if (isCompactMode) {
    // 2 columns => Number, Body+metadata
    html = `
      <table id="output-table" class="table table-hover">
        <thead>
          <tr>
            <th onclick="sortTable('numbering')">Number</th>
            <th onclick="sortTable('body')">Body (Compact)</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(row => {
            const dateString = formatDate(row.dateUtc);
            const meta = `(by ${escapeHtml(row.author)}, ${dateString}, ↑↓ ${row.score})`;
            let bodyHtml = formatBodyForHtml(row.body) + ' ' + escapeHtml(meta);
            return `
              <tr>
                <td>${escapeHtml(row.numbering)}</td>
                <td>${bodyHtml}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } else {
    // 7 columns => Number, Level, Body, Author, Date, Upvotes, Downvotes
    html = `
      <table id="output-table" class="table table-hover">
        <thead>
          <tr>
            <th onclick="sortTable('numbering')">Number</th>
            <th onclick="sortTable('level')">Level</th>
            <th onclick="sortTable('body')">Body</th>
            <th onclick="sortTable('author')">Author</th>
            <th onclick="sortTable('dateUtc')">Date (UTC)</th>
            <th onclick="sortTable('upvotes')">Upvotes</th>
            <th onclick="sortTable('downvotes')">Downvotes</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(row => {
            const dateString = formatDate(row.dateUtc);
            let bodyHtml = formatBodyForHtml(row.body);
            return `
              <tr>
                <td>${escapeHtml(row.numbering)}</td>
                <td>${row.level}</td>
                <td>${bodyHtml}</td>
                <td>${escapeHtml(row.author)}</td>
                <td>${escapeHtml(dateString)}</td>
                <td>${row.upvotes}</td>
                <td>${row.downvotes}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  tableWrapper.innerHTML = html;
  tableBuilt = true;
}

// Escape HTML
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Sorting
let sortAsc = true;
function sortTable(column) {
  if (!tableBuilt || !tableData.length) return;
  if (!(column in tableData[0]) && column !== 'body') {
    return;
  }

  if (column === 'numbering') {
    tableData.sort((a, b) => {
      const arrA = a.numbering.split('.').map(num => parseInt(num));
      const arrB = b.numbering.split('.').map(num => parseInt(num));
      return compareArray(arrA, arrB) * (sortAsc ? 1 : -1);
    });
  } else if (column === 'dateUtc') {
    tableData.sort((a, b) => ((a.dateUtc || 0) - (b.dateUtc || 0)) * (sortAsc ? 1 : -1));
  } else if (['upvotes','downvotes','level','score'].includes(column)) {
    tableData.sort((a, b) => (a[column] - b[column]) * (sortAsc ? 1 : -1));
  } else if (column === 'body') {
    tableData.sort((a, b) => {
      const valA = a.body.toLowerCase();
      const valB = b.body.toLowerCase();
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  } else {
    // e.g. author
    tableData.sort((a, b) => {
      const valA = String(a[column]).toLowerCase();
      const valB = String(b[column]).toLowerCase();
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  sortAsc = !sortAsc;
  renderTable(tableData);
}

// For "2.1.1" => [2,1,1]
function compareArray(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const valA = a[i] || 0;
    const valB = b[i] || 0;
    if (valA < valB) return -1;
    if (valA > valB) return 1;
  }
  return 0;
}

// Download CSV
function downloadCSV() {
  if (!tableBuilt || !tableData.length) {
    alert('No table data to download. Please export first.');
    return;
  }

  let csvContent = '';

  if (isCompactMode) {
    csvContent += 'Number,Body (Compact)\n';
    tableData.forEach(row => {
      const dateString = formatDate(row.dateUtc);
      let bodyText = row.body;
      if (removeNewlines) {
        bodyText = bodyText.replace(/\r?\n|\n\r|\n|\r/g, ' ');
      }
      const combined = `${bodyText} (by ${row.author}, ${dateString}, ↑↓ ${row.score})`
                       .replace(/\r?\n|\r/g, ' ');
      csvContent += convertToCsvRow([row.numbering, combined]) + '\n';
    });
  } else {
    csvContent += 'Number,Level,Body,Author,Date(UTC),Upvotes,Downvotes\n';
    tableData.forEach(row => {
      const dateString = formatDate(row.dateUtc).replace(/\r?\n|\r/g, ' ');
      let bodyText = row.body;
      if (removeNewlines) {
        bodyText = bodyText.replace(/\r?\n|\n\r|\n|\r/g, ' ');
      }
      const rowArr = [
        row.numbering,
        row.level,
        bodyText,
        row.author,
        dateString,
        row.upvotes,
        row.downvotes
      ];
      csvContent += convertToCsvRow(rowArr) + '\n';
    });
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const tempLink = document.createElement('a');
  tempLink.href = url;
  tempLink.download = 'reddit_comments.csv';
  document.body.appendChild(tempLink);
  tempLink.click();
  document.body.removeChild(tempLink);
}

// Convert array of fields to CSV row
function convertToCsvRow(arr) {
  return arr.map(cell => {
    const str = String(cell).replace(/"/g, '""');
    return `"${str}"`;
  }).join(',');
}

// Copy the rendered table as HTML
function copyTableAsHTML() {
  if (!tableBuilt) {
    alert('No table to copy. Please export first.');
    return;
  }
  const tableEl = document.getElementById('output-table');
  if (!tableEl) {
    alert('No table element found!');
    return;
  }

  const tableHtml = tableEl.outerHTML;

  if (navigator.clipboard && window.ClipboardItem) {
    const blob = new Blob([tableHtml], { type: 'text/html' });
    const data = [new ClipboardItem({ 'text/html': blob })];
    navigator.clipboard.write(data).then(() => {
      alert('Table copied as HTML! You can paste it into Word or other applications.');
    }).catch(err => {
      console.error('ClipboardItem failed:', err);
      fallbackCopyAsHTML(tableEl);
    });
  } else {
    fallbackCopyAsHTML(tableEl);
  }
}

// Fallback for older browsers
function fallbackCopyAsHTML(tableEl) {
  const range = document.createRange();
  range.selectNodeContents(tableEl);

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  try {
    const success = document.execCommand('copy');
    if (success) {
      alert('Table copied as HTML! Paste into Word or other applications.');
    } else {
      alert('Unable to copy table.');
    }
  } catch (err) {
    console.error('execCommand Error:', err);
    alert('Error copying table. Please try a modern browser.');
  }
  selection.removeAllRanges();
}
