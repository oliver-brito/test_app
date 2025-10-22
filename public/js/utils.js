// Details button logic
document.addEventListener('DOMContentLoaded', function() {
const detailsBtn = document.getElementById('details-btn');
const detailsModal = document.getElementById('details-modal');
const detailsContent = document.getElementById('details-content');
const closeModalBtn = document.getElementById('close-details-modal');

// Helper: Render foldable JSON
function renderFoldableJSON(obj, parent) {
    if (typeof obj !== 'object' || obj === null) {
    const leaf = document.createElement('span');
    leaf.textContent = JSON.stringify(obj);
    parent.appendChild(leaf);
    return;
    }
    const isArray = Array.isArray(obj);
    const container = document.createElement('div');
    container.style.marginLeft = '16px';
    for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    const item = document.createElement('div');
    item.style.marginBottom = '2px';
    const toggle = document.createElement('span');
    toggle.textContent = isArray ? `[${key}]` : key;
    toggle.style.fontWeight = 'bold';
    toggle.style.cursor = 'pointer';
    toggle.style.color = '#2563eb';
    toggle.style.marginRight = '8px';
    const value = obj[key];
    const childContainer = document.createElement('div');
    childContainer.style.display = 'none';
    childContainer.style.marginLeft = '16px';
    toggle.onclick = function() {
        childContainer.style.display = childContainer.style.display === 'none' ? 'block' : 'none';
    };
    item.appendChild(toggle);
    if (typeof value === 'object' && value !== null) {
        item.appendChild(document.createTextNode(': '));
        item.appendChild(childContainer);
        renderFoldableJSON(value, childContainer);
    } else {
        item.appendChild(document.createTextNode(': ' + JSON.stringify(value)));
    }
    container.appendChild(item);
    }
    parent.appendChild(container);
}

if (detailsBtn) {
    detailsBtn.onclick = async function() {
    try {
        console.log('Fetching details...');
        const r = await fetch('/details');
        const data = await r.json();
        detailsContent.innerHTML = '';
        renderFoldableJSON(data, detailsContent);
        detailsModal.style.display = 'flex';
    } catch (err) {
        detailsContent.innerHTML = '<span style="color:#b91c1c">Error fetching details: ' + err.message + '</span>';
        detailsModal.style.display = 'flex';
    }
    };
}
if (closeModalBtn) {
    closeModalBtn.onclick = function() {
    detailsModal.style.display = 'none';
    };
}
});