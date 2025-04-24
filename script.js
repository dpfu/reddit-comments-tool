/*
  script.js

  A user-friendly front-end for exporting Reddit post data
  (comments, scores, metadata) to CSV or HTML for further analysis,
  plus a refined rectangular-node visualization module using D3.js.
*/

// =========================
// Global Variables & State
// =========================
let http = new XMLHttpRequest();
let tableData = [];
let tableBuilt = false;

// User preferences
let selectedDateFormat = 'iso8601'; // iso8601 | rfc1123 | utc
let isCompactMode = false;
let removeNewlines = false;

// We'll store info about the post itself
let postInfo = null;


// =========================
// INITIAL LOADING
// =========================
function onDocumentReady() {
  const preFilledUrl = getQueryParamUrl();
  if (preFilledUrl) {
    document.getElementById('url-field').value = preFilledUrl;
    startExport();
  }
}

// Read 'url' query param if present
function getQueryParamUrl() {
  return new URLSearchParams(window.location.search).get('url') ?? null;
}


// =========================
// START EXPORT
// =========================
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

  // Hide existing UI blocks
  document.getElementById('post-info-block').classList.add('hidden');
  document.getElementById('output-block').classList.add('hidden');
  document.getElementById('visualization-panel').classList.add('hidden');

  fetchData(url);
}

// Grab the text field value
function getFieldUrl() {
  return document.getElementById('url-field').value.trim();
}


// =========================
// FETCH DATA
// =========================
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

    // Show the visualization panel
    document.getElementById('visualization-panel').classList.remove('hidden');
  };
}

// =========================
// EXTRACT POST INFO
// =========================
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

// =========================
// BUILD TABLE DATA
// =========================
// Recursively process the comment tree with prefix numbering (1,1.1,1.2,...)
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


// =========================
// RENDER POST INFO
// =========================
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


// =========================
// RENDER TABLE
// =========================
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


// =========================
// DATE FORMATTING
// =========================
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

// ISO 8601 style: 2025-03-11T14:19:10+00:00
function formatUTCAsISO8601(dateObj) {
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const hours = String(dateObj.getUTCHours()).padStart(2, '0');
  const mins = String(dateObj.getUTCMinutes()).padStart(2, '0');
  const secs = String(dateObj.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}:${secs}+00:00`;
}

// Simple UTC style: 2025-03-11T14:19:10Z
function formatUTCAsSimple(dateObj) {
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const hours = String(dateObj.getUTCHours()).padStart(2, '0');
  const mins = String(dateObj.getUTCMinutes()).padStart(2, '0');
  const secs = String(dateObj.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}:${secs}Z`;
}

// =========================
// HELPER: Escape HTML
// =========================
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Convert the comment body to HTML with/without line breaks
function formatBodyForHtml(str) {
  if (!str) return '[deleted]';
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


// =========================
// SORTING
// =========================
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


// =========================
// DOWNLOAD CSV
// =========================
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


// =========================
// COPY TABLE AS HTML
// =========================
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


// =========================
// VISUALIZATION MODULE
// =========================

/**
 * Called when user clicks "Render Visualization".
 * 1) Convert tableData => node dictionary => root hierarchy
 * 2) Build a left-to-right collapsible tree with rectangular nodes
 */
function initVisualization() {
  const vizContainer = document.getElementById('viz-container');
  vizContainer.innerHTML = '';

  // 1. Build a dictionary from tableData
  const dict = buildNodeDictionary(tableData);

  // 2. Convert dict => final root hierarchy
  const root = buildHierarchyFromDict(dict);

  // 3. Pass it to D3
  createCollapsibleTree(root, 'viz-container');
}

/**
 * Create a dictionary from tableData, keyed by row.numbering.
 * Each entry has metadata for the node (score, snippet, etc.).
 */
function buildNodeDictionary(data) {
  const dict = {};

  data.forEach(row => {
    const fullNum = row.numbering;       // e.g. "2.1.1"
    const parts = fullNum.split('.');
    const parentId = parts.length > 1
      ? parts.slice(0, -1).join('.')     // e.g. "2.1"
      : null;                            // no parent => root-level

    dict[fullNum] = {
      id: fullNum,
      parentId,
      score: row.score,
      // short snippet
      bodySnippet: createSnippet(row.body),
      fullNumbering: fullNum
    };
  });

  return dict;
}

/**
 * Convert the dictionary into a single "root" hierarchy.
 * The root node has name "Post". Each top-level comment is attached to root.
 */
function buildHierarchyFromDict(dict) {
  const root = { name: "Post", children: [], count: 0 };

  // Initialize each node's children = []
  Object.values(dict).forEach(node => {
    node.children = [];
    node.count = 1; // will recalc below
  });

  // Link children to parents
  Object.values(dict).forEach(node => {
    if (!node.parentId) {
      // top-level => child of root
      root.children.push(node);
    } else if (dict[node.parentId]) {
      dict[node.parentId].children.push(node);
    }
  });

  // Compute total descendant counts
  computeCounts(root);
  return root;
}

/** Short snippet of the body */
function createSnippet(text) {
  if (!text || text === '[deleted]') return '[deleted]';
  const s = text.trim();
  return s.length > 80 ? s.slice(0, 80) + '...' : s;
}

/** Recursively sum up the total number of descendant nodes into node.count */
function computeCounts(node) {
  if (!node.children || node.children.length === 0) {
    node.count = 1;
    return 1;
  }
  let sum = 0;
  node.children.forEach(child => {
    sum += computeCounts(child);
  });
  node.count = sum;
  return sum;
}

/**
 * D3-based collapsible tree with rectangular nodes.
 * Left-to-right orientation, zoom & pan enabled.
 */
function createCollapsibleTree(data, containerId) {
  const margin = { top: 20, right: 50, bottom: 20, left: 50 };
  const width = 1000 - margin.left - margin.right;
  const height = 700 - margin.top - margin.bottom;

  // Create main SVG with zoom/pan
  const svg = d3.select(`#${containerId}`).append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .call(
      d3.zoom()
        .scaleExtent([0.5, 5])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
        })
    );

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const treeLayout = d3.tree()
    .size([height, width])
    .separation((a, b) => 1.5); // extra vertical gap

  let root = d3.hierarchy(data, d => d.children);
  root.x0 = height / 2;
  root.y0 = 0;

  // Initially collapse all except top-level
  if (root.children) {
    root.children.forEach(c => collapseDeep(c, 0));
  }

  update(root);

  function collapseDeep(d, depth=0) {
    if (d.children) {
      if (depth > 0) {
        d._children = d.children;
        d._children.forEach(c => collapseDeep(c, depth+1));
        d.children = null;
      } else {
        d.children.forEach(c => collapseDeep(c, depth+1));
      }
    }
  }

  function update(source) {
    const treeData = treeLayout(root);
    const nodes = treeData.descendants();
    const links = treeData.links();

    // Horizontal offset by depth
    nodes.forEach(d => {
      d.y = d.depth * 180; // room for the rect
    });

    // NODES
    let nodeSel = g.selectAll("g.node")
      .data(nodes, d => d.id || (d.id = Math.random()));

    let nodeEnter = nodeSel.enter().append("g")
      .attr("class", "node")
      .attr("transform", _ => `translate(${source.y0},${source.x0})`)
      .on("click", (event, d) => {
        if (d.children) {
          d._children = d.children;
          d.children = null;
        } else {
          d.children = d._children;
          d._children = null;
        }
        update(d);
      });

    // Rect parameters
    const rectWidth = 140;
    const rectHeight = 40;

    // Node rectangle
    nodeEnter.append("rect")
      .attr("x", 0)
      .attr("y", -rectHeight / 2)
      .attr("width", 1e-6)
      .attr("height", rectHeight)
      .attr("fill", "#fff")
      .attr("stroke", "#999");

    // First text line => numbering
    nodeEnter.append("text")
      .attr("dy", "-0.2em")
      .attr("x", 6)
      .style("font", "12px sans-serif")
      .style("fill-opacity", 1e-6)
      .text(d => d.data.fullNumbering);

    // Second line => Score (+hidden children)
    nodeEnter.append("text")
      .attr("dy", "1.2em")
      .attr("x", 6)
      .style("font", "12px sans-serif")
      .style("fill", "#666")
      .style("fill-opacity", 1e-6)
      .text(d => {
        let scoreLine = `Score: ${d.data.score}`;
        if (d._children && d._children.length > 0) {
          scoreLine += ` (+${d._children.length} hidden)`;
        }
        return scoreLine;
      });

    // Tooltip with snippet
    nodeEnter.append("title")
      .text(d => d.data.bodySnippet);

    // UPDATE
    let nodeUpdate = nodeEnter.merge(nodeSel);

    nodeUpdate.transition()
      .duration(400)
      .attr("transform", d => `translate(${d.y},${d.x})`);

    nodeUpdate.select("rect")
      .attr("width", rectWidth);

    nodeUpdate.selectAll("text")
      .style("fill-opacity", 1);

    // EXIT
    let nodeExit = nodeSel.exit().transition()
      .duration(300)
      .attr("transform", _ => `translate(${source.y},${source.x})`)
      .remove();

    nodeExit.select("rect").attr("width", 1e-6);
    nodeExit.selectAll("text").style("fill-opacity", 1e-6);

    // LINKS
    let linkSel = g.selectAll("path.link")
      .data(links, d => d.target.id);

    let linkEnter = linkSel.enter().insert("path", "g")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("stroke", "#ccc")
      .attr("stroke-width", "1.5px")
      .attr("d", _ => {
        let o = { x: source.x0, y: source.y0 };
        return diagonal(o, o);
      });

    let linkUpdate = linkEnter.merge(linkSel);
    linkUpdate.transition()
      .duration(300)
      .attr("d", d => diagonal(d.source, d.target));

    let linkExit = linkSel.exit().transition()
      .duration(300)
      .attr("d", _ => {
        let o = { x: source.x, y: source.y };
        return diagonal(o, o);
      })
      .remove();

    // Store old positions
    nodes.forEach(d => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  }

  function diagonal(s, t) {
    return `M ${s.y},${s.x}
            C ${(s.y + t.y) / 2},${s.x},
              ${(s.y + t.y) / 2},${t.x},
              ${t.y},${t.x}`;
  }
}
// =========================
// END Visualization Module
// =========================
