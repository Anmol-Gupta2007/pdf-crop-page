// Global State
let uploadedFile = null; 
let originalFileName = "";
let totalPages = 0;

// Array to store custom crop data for EACH page
// Structure: { top, bottom, left, right, origWidthPts, origHeightPts }
let pagesCropData = [];

// UI Elements
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const chooseBtn = document.getElementById('choose-btn');
const pagesContainer = document.getElementById('pages-container');
const actionBar = document.getElementById('action-bar');
const bottomActionBar = document.getElementById('bottom-action-bar');
const modal = document.getElementById('processing-modal');
const downloadBtn = document.getElementById('download-btn');
const downloadBtnBottom = document.getElementById('download-btn-bottom');

// --- Helper: Download Function ---
function download(data, filename, type) {
    const blob = new Blob([data], { type: type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// --- Helper: Points to Inches (PDFs are 72 points per inch) ---
function ptsToInches(pts) {
    return (pts / 72).toFixed(2) + ' in';
}

// --- Event Listeners for Uploading ---
chooseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
uploadArea.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) processFile(e.target.files[0]);
    fileInput.value = ''; 
});

uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
});

// --- Process Uploaded File ---
async function processFile(file) {
    if (file.type !== 'application/pdf') {
        alert("Please select a valid PDF file.");
        return;
    }

    modal.style.display = 'flex';
    uploadedFile = file;
    originalFileName = file.name.replace('.pdf', '');

    try {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        
        // Use PDFLib to get actual dimensions of all pages
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        totalPages = pdfDoc.getPageCount();
        const pages = pdfDoc.getPages();

        pagesCropData = []; // Reset array
        
        // Initialize crop data state for every page
        for (let i = 0; i < totalPages; i++) {
            pagesCropData.push({
                top: 0, bottom: 0, left: 0, right: 0,
                origWidthPts: pages[i].getWidth(),
                origHeightPts: pages[i].getHeight()
            });
        }

        // Generate the UI for all pages
        await buildPageEditors();

        actionBar.style.display = 'block';
        if(totalPages > 1) {
            bottomActionBar.style.display = 'block';
        }

    } catch (error) {
        console.error("Error reading PDF:", error);
        alert("Could not process this PDF.");
    }
    
    modal.style.display = 'none';
}

// --- Generate UI and Render Previews ---
async function buildPageEditors() {
    pagesContainer.innerHTML = '';

    const previewBuffer = await uploadedFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(previewBuffer) });
    const pdfViewerDoc = await loadingTask.promise;

    for (let i = 0; i < totalPages; i++) {
        const origW = ptsToInches(pagesCropData[i].origWidthPts);
        const origH = ptsToInches(pagesCropData[i].origHeightPts);

        // Create HTML block for the page
        const card = document.createElement('div');
        card.className = 'page-crop-card';
        card.innerHTML = `
            <div class="preview-section">
                <div class="page-title">Page ${i + 1}</div>
                <div class="canvas-wrapper">
                    <canvas id="canvas-${i}" class="pdf-canvas"></canvas>
                    <div id="overlay-${i}" class="crop-overlay"></div>
                </div>
            </div>

            <div class="controls-section">
                <h3>Adjust Margins (%)</h3>
                
                <div class="slider-group">
                    <label>Top: <span id="val-top-${i}">0%</span></label>
                    <input type="range" id="crop-top-${i}" min="0" max="45" value="0" oninput="updateCropUI(${i})">
                </div>
                <div class="slider-group">
                    <label>Bottom: <span id="val-bottom-${i}">0%</span></label>
                    <input type="range" id="crop-bottom-${i}" min="0" max="45" value="0" oninput="updateCropUI(${i})">
                </div>
                <div class="slider-group">
                    <label>Left: <span id="val-left-${i}">0%</span></label>
                    <input type="range" id="crop-left-${i}" min="0" max="45" value="0" oninput="updateCropUI(${i})">
                </div>
                <div class="slider-group">
                    <label>Right: <span id="val-right-${i}">0%</span></label>
                    <input type="range" id="crop-right-${i}" min="0" max="45" value="0" oninput="updateCropUI(${i})">
                </div>

                <div class="size-info">
                    <p>Original Size: <strong>${origW} x ${origH}</strong></p>
                    <p>Cropped Size: <strong id="new-size-${i}" style="color: #4facfe;">${origW} x ${origH}</strong></p>
                </div>
            </div>
        `;
        
        pagesContainer.appendChild(card);

        // Render PDF page onto canvas
        try {
            const page = await pdfViewerDoc.getPage(i + 1);
            const canvas = document.getElementById(`canvas-${i}`);
            const context = canvas.getContext('2d');
            
            const unscaledViewport = page.getViewport({ scale: 1 });
            // Scale to fit the 450px max height constraint
            const scale = 450 / unscaledViewport.height; 
            const viewport = page.getViewport({ scale: scale });
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
        } catch (err) {
            console.error("Error rendering preview", err);
        }
    }
}

// --- Dynamic Slider Logic for Specific Page ---
window.updateCropUI = function(pageIndex) {
    const top = parseInt(document.getElementById(`crop-top-${pageIndex}`).value);
    const bottom = parseInt(document.getElementById(`crop-bottom-${pageIndex}`).value);
    const left = parseInt(document.getElementById(`crop-left-${pageIndex}`).value);
    const right = parseInt(document.getElementById(`crop-right-${pageIndex}`).value);

    // Save to state
    pagesCropData[pageIndex].top = top;
    pagesCropData[pageIndex].bottom = bottom;
    pagesCropData[pageIndex].left = left;
    pagesCropData[pageIndex].right = right;

    // Update text labels
    document.getElementById(`val-top-${pageIndex}`).innerText = top + '%';
    document.getElementById(`val-bottom-${pageIndex}`).innerText = bottom + '%';
    document.getElementById(`val-left-${pageIndex}`).innerText = left + '%';
    document.getElementById(`val-right-${pageIndex}`).innerText = right + '%';

    // Update CSS overlay
    const overlay = document.getElementById(`overlay-${pageIndex}`);
    overlay.style.top = top + '%';
    overlay.style.bottom = bottom + '%';
    overlay.style.left = left + '%';
    overlay.style.right = right + '%';

    // Calculate and display new size
    const origW = pagesCropData[pageIndex].origWidthPts;
    const origH = pagesCropData[pageIndex].origHeightPts;

    const newWidthPts = origW * (1 - (left + right) / 100);
    const newHeightPts = origH * (1 - (top + bottom) / 100);

    document.getElementById(`new-size-${pageIndex}`).innerText = 
        `${ptsToInches(newWidthPts)} x ${ptsToInches(newHeightPts)}`;
}

// --- Process and Download Final Cropped PDF ---
async function downloadCroppedPdf() {
    if (!uploadedFile) return;
    modal.style.display = 'flex';

    try {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();
        
        // Loop through all pages and apply their specific crop data
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const data = pagesCropData[i];

            const topPercent = data.top / 100;
            const bottomPercent = data.bottom / 100;
            const leftPercent = data.left / 100;
            const rightPercent = data.right / 100;

            const w = data.origWidthPts;
            const h = data.origHeightPts;

            // PDF Coordinate System: (0,0) is bottom-left corner
            const cropX = w * leftPercent;
            const cropY = h * bottomPercent;
            const cropWidth = w - (w * leftPercent) - (w * rightPercent);
            const cropHeight = h - (h * topPercent) - (h * bottomPercent);

            page.setCropBox(cropX, cropY, cropWidth, cropHeight);
            page.setMediaBox(cropX, cropY, cropWidth, cropHeight);
        }

        const newPdfBytes = await pdfDoc.save();
        download(newPdfBytes, `${originalFileName}_Cropped.pdf`, "application/pdf");
        
    } catch (error) {
        console.error("Error cropping PDF:", error);
        alert(`Failed to crop the PDF. Error: ${error.message}`);
    }
    
    modal.style.display = 'none';
}

downloadBtn.addEventListener('click', downloadCroppedPdf);
downloadBtnBottom.addEventListener('click', downloadCroppedPdf);
