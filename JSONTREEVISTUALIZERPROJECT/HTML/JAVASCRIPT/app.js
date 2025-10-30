// BB8 toggle - dark/light mode (persistent)
const toggle = document.getElementById('darkModeToggle');
const body = document.body;
if ((localStorage.getItem('theme') === 'dark') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches && !localStorage.getItem('theme'))) {
  toggle.checked = true;
  body.classList.add('dark-mode');
}
toggle.addEventListener('change', function () {
  if (this.checked) {
    body.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark');
  } else {
    body.classList.remove('dark-mode');
    localStorage.setItem('theme', 'light');
  }
});

(() => {
  // --- DOM ---
  const svg = document.getElementById("svgRoot");
  const jsonInput = document.getElementById("jsonInput");
  const jsonError = document.getElementById("jsonError");
  const visualizeBtn = document.getElementById("visualizeBtn");
  const clearBtn = document.getElementById("clearBtn");
  const searchInput = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");
  const searchMessage = document.getElementById("searchMessage");
  const treeContainer = document.getElementById("treeContainer");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const fitViewBtn = document.getElementById("fitViewBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const actionMessage = document.getElementById("actionMessage");
  let data = null, nodes = [], edges = [], highlightNodeIds = [];

  let scale = 1, translateX = 0, translateY = 0, isPanning = false, startPan = { x: 0, y: 0 };
  const NODE_WIDTH = 140, NODE_HEIGHT = 38, LEVEL_X_SPACING = 180, NODE_Y_SPACING = 70;

  // --- JSON path parse --- code--
  function parsePath(path) {
    let p = path.trim();
    if (p.startsWith("$.")) p = p.slice(2);
    else if (p.startsWith("$")) p = p.slice(1);
    let regex = /([^[.\]]+)|\[(\d+)\]/g;
    let result = [], match;
    while ((match = regex.exec(p))) {
      if (match[1]) result.push(match[1]);
      if (match[2]) result.push(Number(match[2]));
    }
    return result;
  }

  // --- Tree Construction ---code--
  function getNodeType(v) {
    if (v === null || typeof v !== "object") return "primitive";
    if (Array.isArray(v)) return "array";
    return "object";
  }
  function buildTree(data, path = "$", depth = 0, yIndexObj = { y: 0 }) {
    let type = getNodeType(data);
    let nodeId = path;
    let node = {
      id: nodeId, data: data, type, depth, yIndex: yIndexObj.y, children: []
    };
    yIndexObj.y++;
    if (type === "object") {
      for (const key in data) {
        let childPath = path === "$" ? key : path + "." + key;
        node.children.push(buildTree(data[key], childPath, depth + 1, yIndexObj));
      }
    } else if (type === "array") {
      data.forEach((item, idx) => {
        let childPath = `${path}[${idx}]`;
        node.children.push(buildTree(item, childPath, depth + 1, yIndexObj));
      });
    }
    return node;
  }
  function flattenTree(node) {
    let flatNodes = [{
      id: node.id, label: getLabel(node), type: node.type,
      x: node.depth * LEVEL_X_SPACING, y: node.yIndex * NODE_Y_SPACING
    }], flatEdges = [];
    node.children.forEach((child) => {
      flatEdges.push({ from: node.id, to: child.id });
      const { flatNodes: fn, flatEdges: fe } = flattenTree(child);
      flatNodes = flatNodes.concat(fn);
      flatEdges = flatEdges.concat(fe);
    });
    return { flatNodes, flatEdges };
  }
  function getLabel(node) {
    if (node.type === "object") return `{ } ${node.id}`;
    if (node.type === "array") return `[ ] ${node.id}`;
    let key = node.id.includes(".") ? node.id.split(".").pop() : node.id;
    if (key.includes("[")) { let arrMatch = /\[(\d+)\]/.exec(key); if (arrMatch) key = key; }
    return `${key}: ${JSON.stringify(node.data)}`;
  }

  // --- Render --- code
  function renderTree() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("style", `transform: translate(${translateX}px,${translateY}px) scale(${scale})`);
    if (!data) return;
    const tree = buildTree(data);
    const { flatNodes, flatEdges } = flattenTree(tree);
    nodes = flatNodes; edges = flatEdges;
    edges.forEach(({ from, to }) => {
      const fromNode = nodes.find((n) => n.id === from);
      const toNode = nodes.find((n) => n.id === to);
      if (!fromNode || !toNode) return;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", fromNode.x + NODE_WIDTH);
      line.setAttribute("y1", fromNode.y + NODE_HEIGHT / 2);
      line.setAttribute("x2", toNode.x);
      line.setAttribute("y2", toNode.y + NODE_HEIGHT / 2);
      line.setAttribute("class", "edge-line");
      svg.appendChild(line);
    });
    nodes.forEach(({ id, label, type, x, y }) => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g"); 
      g.setAttribute("class", "node-group");
      g.setAttribute("data-nodeid", id);
      g.style.cursor = "pointer";
      //Copy path 
      g.addEventListener("click", function(e) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(id).then(() => {
            actionMessage.textContent = `Copied path: ${id}`;
          });
        } else { // fallback
          let ta = document.createElement('textarea');
          ta.value = id; document.body.appendChild(ta);
          ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          actionMessage.textContent = `Copied path: ${id}`;
        }
        setTimeout(() => actionMessage.textContent = "", 1400);
        e.stopPropagation();
      });
      // Node shape
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("width", NODE_WIDTH); rect.setAttribute("height", NODE_HEIGHT);
      rect.setAttribute("rx", 6); rect.setAttribute("ry", 6); rect.setAttribute("class", "node-rect");
      if (highlightNodeIds.includes(id)) rect.classList.add("node-highlight");
      else if (type === "object") rect.classList.add("node-object");
      else if (type === "array") rect.classList.add("node-array");
      else rect.classList.add("node-primitive");
      rect.setAttribute("x", x); rect.setAttribute("y", y);
      // Node label
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.textContent = label;
      text.setAttribute("x", x + 10); text.setAttribute("y", y + 24); text.setAttribute("class", "node-text");
      text.setAttribute("pointer-events", "none"); text.setAttribute("style", "user-select:none");
      g.appendChild(rect); g.appendChild(text); svg.appendChild(g);
    });
  }

  function zoom(factor) {
    scale *= factor;
    if (scale < 0.2) scale = 0.2;
    else if (scale > 5) scale = 5;
    renderTree();
  }
  function fitView() {
    scale = 1;
    translateX = 0;
    translateY = 0;
    renderTree();
  }
  treeContainer.addEventListener("mousedown", (e) => {
    isPanning = true; startPan.x = e.clientX - translateX; startPan.y = e.clientY - translateY;
    treeContainer.style.cursor = "grabbing";
  });
  window.addEventListener("mouseup", () => { isPanning = false; treeContainer.style.cursor = "default"; });
  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    translateX = e.clientX - startPan.x;
    translateY = e.clientY - startPan.y;
    renderTree();
  });

  function searchNodesByPaths(paths) {
    if (!data) return [];
    let foundIds = [];
    let firstNodeId = null;
    paths.forEach(path => {
      path = path.trim();
      if (!path) return;
      const parts = parsePath(path);
      let curr = data;
      let currentPath = "$";
      for (let part of parts) {
        if (curr === null || curr === undefined) return;
        if (typeof part === "number") {
          if (!Array.isArray(curr) || part >= curr.length) return;
          curr = curr[part]; currentPath += `[${part}]`;
        } else {
          if (typeof curr !== "object" || !(part in curr)) return;
          curr = curr[part]; currentPath += (currentPath === "$" ? "" : ".") + part;
        }
      }
      foundIds.push(currentPath);
      if (!firstNodeId) firstNodeId = currentPath;
    });
    return foundIds;
  }
  function centerOnNode(nodeId) {
    let node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const containerRect = treeContainer.getBoundingClientRect();
    translateX = containerRect.width / 2 - node.x * scale - NODE_WIDTH / 2 * scale;
    translateY = containerRect.height / 2 - node.y * scale - NODE_HEIGHT / 2 * scale;
    renderTree();
  }


  searchInput.addEventListener("input", () => {
    searchBtn.disabled = !searchInput.value.trim();
    searchMessage.textContent = "";
  });
  visualizeBtn.addEventListener("click", () => visualize());
  function visualize() {
    jsonError.textContent = "";
    searchMessage.textContent = "";
    actionMessage.textContent = "";
    highlightNodeIds = []; nodes = []; edges = [];
    try {
      data = JSON.parse(jsonInput.value);
      renderTree();
      searchBtn.disabled = !searchInput.value.trim();
    } catch (e) {
      jsonError.textContent = "Invalid JSON: " + e.message;
      data = null; nodes = []; edges = []; highlightNodeIds = [];
      renderTree(); searchBtn.disabled = true;
    }
  }
  clearBtn.addEventListener("click", () => {
    jsonInput.value = '';
    jsonError.textContent = '';
    actionMessage.textContent = '';
    searchInput.value = '';
    searchMessage.textContent = '';
    highlightNodeIds = [];
    data = null; nodes = []; edges = [];
    renderTree();
  });
  searchBtn.addEventListener("click", () => {
  if (!data) {
    searchMessage.style.color = "red";
    searchMessage.textContent = "No data loaded!";
    return;
  }
  let pathsRaw = searchInput.value;
  let paths = pathsRaw.split(",").map(p => p.trim()).filter(p => p.length > 0);

  let foundIds = [];
  let actualMatches = [];
  for (const path of paths) {
    const parts = parsePath(path);
    let curr = data;
    let currentPath = "$";
    let found = true;
    for (let part of parts) {
      if (curr == null) { found = false; break; }
      if (typeof part === "number") {
        if (!Array.isArray(curr) || part >= curr.length) { found = false; break; }
        curr = curr[part];
        currentPath += `[${part}]`;
      } else {
        if (typeof curr !== "object" || !(part in curr)) { found = false; break; }
        curr = curr[part];
        currentPath += (currentPath === "$" ? "" : ".") + part;
      }
    }
    if (found && nodes.some(n => n.id === currentPath)) {
      foundIds.push(currentPath);
      actualMatches.push({ path, value: curr });
    }
  }

  highlightNodeIds = foundIds;
  if (foundIds.length > 0) {
    searchMessage.style.color = "green";
    searchMessage.innerHTML = "Match found:<br>" + actualMatches.map(match => `<b>${match.path}</b>: ${JSON.stringify(match.value)}`).join("<br>");
    centerOnNode(foundIds[0]);
  } else {
    searchMessage.style.color = "red";
    searchMessage.textContent = "No match found";
  }
  renderTree();
});

  zoomInBtn.addEventListener("click", () => zoom(1.2));
  zoomOutBtn.addEventListener("click", () => zoom(0.8));
  fitViewBtn.addEventListener("click", () => fitView());
// --- Download as PNG (Full Tree Capture, No Cropping) ---
downloadBtn.addEventListener("click", async function () {
  actionMessage.textContent = "Preparing image...";

  // Temporarily reset view to full scale before capture
  const prevScale = scale;
  const prevX = translateX;
  const prevY = translateY;
  scale = 1;
  translateX = 0;
  translateY = 0;
  renderTree();

  // Allow layout to stabilize
  await new Promise(r => setTimeout(r, 300));

  // ✅ Inline text styles to preserve labels
  function inlineSVGTextStyles(svgElement) {
    const textElements = svgElement.querySelectorAll("text");
    textElements.forEach(t => {
      const style = window.getComputedStyle(t);
      t.setAttribute("fill", style.fill || "#000");
      t.setAttribute("font-family", style.fontFamily || "Arial, sans-serif");
      t.setAttribute("font-size", style.fontSize || "12px");
      t.setAttribute("font-weight", style.fontWeight || "400");
      t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("text-anchor", "start");
    });
  }
  inlineSVGTextStyles(svg);

  const serializer = new XMLSerializer();
  const svgContent = serializer.serializeToString(svg);

  const canvas = document.createElement("canvas");
  const bbox = svg.getBBox(); // Get actual drawn area
  canvas.width = bbox.width + 80;
  canvas.height = bbox.height + 80;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const img = new Image();
  img.src = 'data:image/svg+xml;base64,' +
    btoa('<?xml version="1.0" encoding="UTF-8"?>' + svgContent);

  img.onload = function () {
    ctx.fillStyle = body.classList.contains('dark-mode') ? "#181c22" : "#f4f6fb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 40, 40); // add padding

    const a = document.createElement("a");
    a.download = "json-tree.png";
    a.href = canvas.toDataURL("image/png");
    a.click();

    actionMessage.textContent = "Image downloaded!";
    setTimeout(() => { actionMessage.textContent = ""; }, 1300);

    // Restore original zoom
    scale = prevScale;
    translateX = prevX;
    translateY = prevY;
    renderTree();
  };

  img.onerror = function () {
    actionMessage.textContent = "Failed to render SVG image!";
    scale = prevScale;
    translateX = prevX;
    translateY = prevY;
    renderTree();
  };



  img.onerror = function () {
    actionMessage.textContent = "Failed to render SVG image!";
    scale = prevScale;
    translateX = prevX;
    translateY = prevY;
    renderTree();
  };
});

  visualizeBtn.click();
})();
// End visualizer
