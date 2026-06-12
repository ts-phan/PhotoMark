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
        // 1. Recadrage au ratio de l'écran
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
        
        // On dessine la photo immédiatement
        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

        // 2. Préparation des données par défaut
        const now = new Date();
        let cityStr = "Recherche localisation...";
        let lat = 0, lon = 0;
        let mapTileImg = null;

        // 3. Récupération des données AVEC sécurité anti-blocage
        try {
            const coords = await getCoordinates();
            lat = coords.latitude;
            lon = coords.longitude;
            
            // On lance la recherche de la ville et de la carte en parallèle pour aller plus vite
            const [fetchedCity, fetchedMap] = await Promise.all([
                getCity(lat, lon),
                getMapTile(lat, lon)
            ]);
            
            cityStr = fetchedCity;
            mapTileImg = fetchedMap;

        } catch (error) {
            console.warn("Avertissement GPS/Réseau :", error);
            cityStr = "Localisation indisponible";
        }

        // 4. Dessin final par-dessus la photo
        drawTextOnCanvas(now, cityStr, lat, lon, mapTileImg);
        
        statusDiv.innerText = "";
        saveBtn.style.display = 'block';
    };
});

// --- API ET UTILITAIRES (SÉCURISÉS AVEC TIMEOUTS) ---

function getCoordinates() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject("Géolocalisation non supportée");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err.message),
            { 
                enableHighAccuracy: true, 
                timeout: 5000, // CRUCIAL : Stoppe la recherche au bout de 5 secondes max
                maximumAge: 10000 
            }
        );
    });
}

async function getCity(lat, lon) {
    try {
        // Ajout d'un système d'abandon si l'API met trop de temps (AbortController)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 secondes max

        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'PhotoPWA/1.0' },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error("Erreur serveur API");
        const data = await response.json();
        
        return data.address.city || data.address.town || data.address.village || data.address.municipality || "Ville inconnue";
    } catch (error) {
        console.warn("Erreur Ville:", error);
        return "Localisation indisponible";
    }
}

function getMapTile(lat, lon, zoom = 15) {
    return new Promise((resolve) => {
        const n = Math.pow(2, zoom);
        const x = Math.floor(n * ((lon + 180) / 360));
        const latRad = lat * Math.PI / 180;
        const y = Math.floor(n * (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2);

        const url = `https://a.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

        const img = new Image();
        img.crossOrigin = "anonymous";
        
        // Failsafe : si l'image met plus de 4 secondes à charger, on force l'annulation
        const timer = setTimeout(() => {
            img.src = ""; 
            resolve(null);
        }, 4000);

        img.onload = () => {
            clearTimeout(timer);
            resolve(img);
        };
        img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
        };
        
        img.src = url;
    });
}

// --- LE NOUVEAU DESIGN GRAPHIQUE ---

function drawTextOnCanvas(now, city, lat, lon, mapImg) {
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let dayStr = now.toLocaleDateString('fr-FR', { weekday: 'short' });
    dayStr = dayStr.charAt(0).toUpperCase() + dayStr.slice(1);
    
    const latStr = (lat !== 0) ? lat.toFixed(6) + "°N" : "N/A";
    const lonStr = (lon !== 0) ? lon.toFixed(6) + "°E" : "N/A";
    const coordStr = `Coordonnée: ${latStr}, ${lonStr}`;

    const padding = canvas.width * 0.04;
    const baseY = canvas.height - padding;

    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = "white";
    ctx.textBaseline = "bottom";

    ctx.font = `${canvas.height * 0.018}px sans-serif`;
    ctx.fillText(coordStr, padding, baseY);

    const cityY = baseY - (canvas.height * 0.03);
    ctx.font = `${canvas.height * 0.022}px sans-serif`;
    ctx.fillText(city, padding, cityY);

    const timeY = cityY - (canvas.height * 0.015);
    ctx.font = `bold ${canvas.height * 0.065}px "Arial Narrow", sans-serif`;
    ctx.fillText(timeStr, padding, timeY);

    const timeWidth = ctx.measureText(timeStr).width;
    const lineX = padding + timeWidth + (canvas.width * 0.025);
    
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = canvas.width * 0.005;
    const lineTop = timeY - (canvas.height * 0.055);
    ctx.beginPath();
    ctx.moveTo(lineX, timeY);
    ctx.lineTo(lineX, lineTop);
    ctx.stroke();

    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.fillStyle = "white";
    ctx.textBaseline = "top";
    ctx.font = `${canvas.height * 0.02}px sans-serif`;
    const dateX = lineX + (canvas.width * 0.02);
    
    ctx.fillText(dateStr, dateX, lineTop);
    ctx.fillText(dayStr, dateX, lineTop + (canvas.height * 0.028));

    if (mapImg) {
        const mapSize = canvas.width * 0.22;
        const mapX = canvas.width - padding - mapSize;
        const mapY = canvas.height - padding - mapSize;

        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.fillStyle = "white";
        ctx.fillRect(mapX - 3, mapY - 3, mapSize + 6, mapSize + 6);

        ctx.shadowColor = "transparent";
        ctx.drawImage(mapImg, mapX, mapY, mapSize, mapSize);

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
    }, 'image/jpeg', 0.95);
});
