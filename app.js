// --- ÉLÉMENTS DU DOM ---
const cameraInput = document.getElementById('cameraInput');
const canvas = document.getElementById('photoCanvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');
const viewAppareil = document.getElementById('viewAppareil');
const viewGalerie = document.getElementById('viewGalerie');
const btnAppareil = document.getElementById('btnAppareil');
const btnGalerie = document.getElementById('btnGalerie');
const galleryGrid = document.getElementById('galleryGrid');

// --- NAVIGATION ---
btnAppareil.addEventListener('click', () => {
    viewAppareil.classList.add('active');
    viewGalerie.classList.remove('active');
});

btnGalerie.addEventListener('click', () => {
    viewGalerie.classList.add('active');
    viewAppareil.classList.remove('active');
    loadGallery(); // Charge les photos quand on ouvre la galerie
});

// --- BASE DE DONNÉES (IndexedDB pour la galerie PWA) ---
let db;
const request = indexedDB.open("PWAGalleryDB", 1);

request.onupgradeneeded = (e) => {
    db = e.target.result;
    // Crée une table "photos"
    db.createObjectStore("photos", { autoIncrement: true });
};

request.onsuccess = (e) => {
    db = e.target.result;
    loadGallery();
};

function saveToPWAGallery(blob) {
    const transaction = db.transaction(["photos"], "readwrite");
    const store = transaction.objectStore("photos");
    store.add({ blob: blob, date: new Date().getTime() });
    console.log("Photo sauvegardée dans la galerie PWA !");
}

function loadGallery() {
    galleryGrid.innerHTML = ""; // Vider la grille
    const transaction = db.transaction(["photos"], "readonly");
    const store = transaction.objectStore("photos");
    const request = store.openCursor(null, 'prev'); // 'prev' pour les plus récentes en premier

    request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const imgBlob = cursor.value.blob;
            const imgUrl = URL.createObjectURL(imgBlob);
            
            const imgElement = document.createElement('img');
            imgElement.src = imgUrl;
            imgElement.className = "gallery-item";
            galleryGrid.appendChild(imgElement);
            
            cursor.continue();
        }
    };
}

// --- LOGIQUE DE CAPTURE ---
cameraInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    statusDiv.innerText = "⏳ Recherche du signal GPS... (Veuillez autoriser)";
    canvas.style.display = 'none';

    // 1. Récupération robuste des coordonnées GPS
    let lat = 0, lon = 0;
    try {
        const coords = await getCoordinates();
        lat = coords.latitude;
        lon = coords.longitude;
    } catch (error) {
        statusDiv.innerText = "❌ Échec GPS : " + error;
        return; // On arrête tout si le GPS ne marche pas
    }

    statusDiv.innerText = "⏳ Récupération de l'adresse et de la météo...";
    
    // 2. Récupération des API
    let locationStr = await getAddress(lat, lon); 
    let weatherStr = await getWeather(lat, lon);
    const dateStr = new Date().toLocaleString('fr-FR');

    // 3. Traitement de l'image
    const imgURL = URL.createObjectURL(file);
    const img = new Image();
    img.src = imgURL;

img.onload = async () => {
        // 1. Calcul du ratio de l'écran du téléphone
        const screenRatio = window.innerHeight / window.innerWidth;
        const imgRatio = img.height / img.width;

        let sourceX = 0, sourceY = 0;
        let sourceWidth = img.width, sourceHeight = img.height;

        // 2. Ajustement pour recadrer (crop) l'image au centre
        if (imgRatio > screenRatio) {
            // L'image est plus allongée que l'écran : on coupe en haut et en bas
            sourceHeight = img.width * screenRatio;
            sourceY = (img.height - sourceHeight) / 2;
        } else {
            // L'image est plus large que l'écran : on coupe sur les côtés
            sourceWidth = img.height / screenRatio;
            sourceX = (img.width - sourceWidth) / 2;
        }

        // 3. Définir la taille finale du canvas (qui aura le ratio de l'écran)
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;

        // 4. Dessiner uniquement la portion recadrée sur le canvas
        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

        // --- La suite reste identique ---
        const dateStr = new Date().toLocaleString('fr-FR');
        let locationStr = "Recherche localisation...";
        let weatherStr = "Météo en cours...";

        try {
            const coords = await getCoordinates();
            locationStr = await getAddress(coords.latitude, coords.longitude); 
            weatherStr = await getWeather(coords.latitude, coords.longitude);
        } catch (error) {
            console.error("Erreur", error);
            locationStr = "Localisation indisponible";
            weatherStr = "Météo indisponible";
        }

        drawTextOnCanvas(dateStr, locationStr, weatherStr);
        
        statusDiv.innerText = "";
        saveBtn.style.display = 'block';
    };
});

// --- API ET UTILITAIRES ---

function getCoordinates() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) reject("Géolocalisation non supportée par le navigateur.");
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => {
                if(err.code === 1) reject("Autorisation GPS refusée.");
                else if(err.code === 2) reject("Position indisponible (Pas de signal).");
                else if(err.code === 3) reject("Délai d'attente dépassé.");
                else reject("Erreur inconnue.");
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } // Timeout augmenté à 15s
        );
    });
}

async function getAddress(lat, lon) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
        const response = await fetch(url, { headers: { 'User-Agent': 'PhotoPWA/1.0' } });
        const data = await response.json();
        
        const rue = data.address.road || data.address.pedestrian || "";
        const ville = data.address.city || data.address.town || data.address.village || "";
        const cp = data.address.postcode || "";
        
        return `${rue}, ${cp} ${ville}`.trim() === "," ? data.display_name : `${rue}, ${cp} ${ville}`;
    } catch (error) {
        return "Adresse introuvable";
    }
}

async function getWeather(lat, lon) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
        const response = await fetch(url);
        const data = await response.json();
        return `${data.current.temperature_2m}°C`; // Juste la température pour gagner de la place
    } catch (error) {
        return "Météo N/A";
    }
}

function drawTextOnCanvas(date, location, weather) {
    // Vos nouvelles constantes
    const barHeight = canvas.height * 0.12; 
    const fontSize = canvas.height * 0.025; 
    const padding = canvas.width * 0.025;

    // Fond noir avec transparence à 30% (0.3)
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

    // Style du texte
    ctx.fillStyle = "white";
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textBaseline = "top";

    // Calcul de l'espacement entre les 3 lignes pour qu'elles tiennent bien dans la barre
    const lineSpacing = barHeight / 3;

    // Affichage des textes avec les nouveaux paddings
    ctx.fillText(`📅 ${date}`, padding, canvas.height - barHeight + (lineSpacing * 0.15));
    ctx.fillText(`📍 ${location}`, padding, canvas.height - barHeight + (lineSpacing * 1.15));
    ctx.fillText(`☁️ ${weather}`, padding, canvas.height - barHeight + (lineSpacing * 2.15));
}

// --- TENTATIVE DE TÉLÉCHARGEMENT NATIVE ---
function autoDownloadToPhone(blob) {
    const link = document.createElement('a');
    link.download = `Photo_${new Date().getTime()}.jpg`;
    link.href = URL.createObjectURL(blob);
    // On simule un clic. Sur Android, ça télécharge souvent tout de suite.
    // Sur iOS, Safari ignorera souvent cette action car elle n'est pas initiée par un vrai "clic" utilisateur.
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
