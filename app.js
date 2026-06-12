const cameraInput = document.getElementById('cameraInput');
const canvas = document.getElementById('photoCanvas');
const ctx = canvas.getContext('2d');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');

cameraInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    statusDiv.innerText = "Création du visuel en cours...";
    canvas.style.display = 'block';
    saveBtn.style.display = 'none';

    const imgURL = URL.createObjectURL(file);
    const img = new Image();
    img.src = imgURL;

    img.onload = async () => {
        // 1. Recadrage au ratio de l'écran (Story/Plein écran)
        const screenRatio = window.innerHeight / window.innerWidth;
        const imgRatio = img.height / img.width;

        let sourceX = 0, sourceY = 0;
        let sourceWidth = img.width, sourceHeight = img.height;

        if (imgRatio > screenRatio) {
            sourceHeight = img.width * screenRatio;
            sourceY = (img.height - sourceHeight) / 2;
        } else {
            sourceWidth = img.height / screenRatio;
            sourceX = (img.width - sourceWidth) / 2;
        }

        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

        // 2. Récupération des données
        const now = new Date();
        let cityStr = "Recherche localisation...";
        let lat = 0, lon = 0;
        let mapTileImg = null;

        try {
            const coords = await getCoordinates();
            lat = coords.latitude;
            lon = coords.longitude;
            cityStr = await getCity(lat, lon); 
            // Récupère l'image de la mini-carte
            mapTileImg = await getMapTile(lat, lon);
        } catch (error) {
            console.error("Erreur GPS", error);
            cityStr = "Localisation indisponible";
        }

        // 3. Dessin du nouveau design sur la photo
        drawTextOnCanvas(now, cityStr, lat, lon, mapTileImg);
        
        statusDiv.innerText = "";
        saveBtn.style.display = 'block';
    };
});

// --- API ET UTILITAIRES ---

function getCoordinates() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) reject("Géolocalisation non supportée");
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err),
            { enableHighAccuracy: true }
        );
    });
}

// Fonction modifiée pour ne récupérer que la ville
async function getCity(lat, lon) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'PhotoPWA/1.0' }
        });
        const data = await response.json();
        return data.address.city || data.address.town || data.address.village || data.address.municipality || "Ville inconnue";
    } catch (error) {
        return "Localisation indisponible";
    }
}

// NOVEAU : Fonction pour récupérer une image de carte OpenStreetMap
function getMapTile(lat, lon, zoom = 15) {
    return new Promise((resolve) => {
        // Formules mathématiques pour convertir le GPS en coordonnées d'image (tuile de carte)
        const n = Math.pow(2, zoom);
        const x = Math.floor(n * ((lon + 180) / 360));
        const latRad = lat * Math.PI / 180;
        const y = Math.floor(n * (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2);

        const url = `https://a.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

        const img = new Image();
        img.crossOrigin = "anonymous"; // Indispensable pour pouvoir sauvegarder l'image finale
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

// --- LE NOUVEAU DESIGN GRAPHIQUE ---

function drawTextOnCanvas(now, city, lat, lon, mapImg) {
    // Formatage des textes
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let dayStr = now.toLocaleDateString('fr-FR', { weekday: 'short' });
    dayStr = dayStr.charAt(0).toUpperCase() + dayStr.slice(1); // Majuscule (ex: Ven)
    
    // Formatage GPS
    const latStr = (lat !== 0) ? lat.toFixed(6) + "°N" : "N/A";
    const lonStr = (lon !== 0) ? lon.toFixed(6) + "°E" : "N/A";
    const coordStr = `Coordonnée: ${latStr}, ${lonStr}`;

    const padding = canvas.width * 0.04;
    const baseY = canvas.height - padding; // Point de départ en bas à gauche

    // Ombre portée pour remplacer la barre noire et rendre le texte lisible partout
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = "white";
    ctx.textBaseline = "bottom";

    // 1. Les Coordonnées (Tout en bas)
    ctx.font = `${canvas.height * 0.018}px sans-serif`;
    ctx.fillText(coordStr, padding, baseY);

    // 2. La Ville (Au-dessus des coordonnées)
    const cityY = baseY - (canvas.height * 0.03);
    ctx.font = `${canvas.height * 0.022}px sans-serif`;
    ctx.fillText(city, padding, cityY);

    // 3. L'Heure (En grand, au-dessus de la ville)
    const timeY = cityY - (canvas.height * 0.015);
    ctx.font = `bold ${canvas.height * 0.065}px "Arial Narrow", sans-serif`;
    ctx.fillText(timeStr, padding, timeY);

    // 4. La Ligne Rouge de séparation
    const timeWidth = ctx.measureText(timeStr).width;
    const lineX = padding + timeWidth + (canvas.width * 0.025);
    
    ctx.shadowColor = "transparent"; // On retire l'ombre pour la ligne
    ctx.strokeStyle = "#e74c3c"; // Rouge
    ctx.lineWidth = canvas.width * 0.005;
    const lineTop = timeY - (canvas.height * 0.055);
    ctx.beginPath();
    ctx.moveTo(lineX, timeY);
    ctx.lineTo(lineX, lineTop);
    ctx.stroke();

    // 5. La Date et le Jour (À droite de la ligne rouge)
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.fillStyle = "white";
    ctx.textBaseline = "top";
    ctx.font = `${canvas.height * 0.02}px sans-serif`;
    const dateX = lineX + (canvas.width * 0.02);
    
    ctx.fillText(dateStr, dateX, lineTop);
    ctx.fillText(dayStr, dateX, lineTop + (canvas.height * 0.028));

    // 6. La Vignette de la Carte (En bas à droite)
    if (mapImg) {
        const mapSize = canvas.width * 0.22; // Taille de la carte (22% de la largeur de l'écran)
        const mapX = canvas.width - padding - mapSize;
        const mapY = canvas.height - padding - mapSize;

        // Bordure blanche
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.fillStyle = "white";
        ctx.fillRect(mapX - 3, mapY - 3, mapSize + 6, mapSize + 6);

        // Dessin de la carte OSM
        ctx.shadowColor = "transparent";
        ctx.drawImage(mapImg, mapX, mapY, mapSize, mapSize);

        // Point de localisation (Pin Bleu façon iOS)
        ctx.fillStyle = "#007AFF"; 
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mapX + mapSize / 2, mapY + mapSize / 2, mapSize * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

// --- SAUVEGARDE ET PARTAGE ---

saveBtn.addEventListener('click', async () => {
    canvas.toBlob(async (blob) => {
        const file = new File([blob], "photo_annotee.jpg", { type: "image/jpeg" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Ma Photo',
                    text: 'Photo avec GPS et carte.'
                });
            } catch (err) {
                console.log("Partage annulé ou échoué", err);
            }
        } else {
            const link = document.createElement('a');
            link.download = `photo_${Date.now()}.jpg`;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        }
    }, 'image/jpeg', 0.95); // Qualité augmentée à 95% pour un meilleur rendu
});
