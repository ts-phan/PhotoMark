const cameraInput = document.getElementById('cameraInput');
const canvas = document.getElementById('photoCanvas');
const ctx = canvas.getContext('2d');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');

cameraInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    statusDiv.innerText = "Traitement de l'image et récupération des données...";
    canvas.style.display = 'block';

    const imgURL = URL.createObjectURL(file);
    const img = new Image();
    img.src = imgURL;

    img.onload = async () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

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
        if (!navigator.geolocation) reject("Géolocalisation non supportée");
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err),
            { enableHighAccuracy: true }
        );
    });
}

async function getAddress(lat, lon) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'PhotoPWA/1.0 (test@example.com)' }
        });
        const data = await response.json();
        // On extrait juste la rue et la ville pour éviter un texte trop long
        const rue = data.address.road || data.address.pedestrian || "";
        const ville = data.address.city || data.address.town || data.address.village || "";
        return `${rue}, ${ville}`.trim() === "," ? data.display_name : `${rue}, ${ville}`;
    } catch (error) {
        return "Adresse introuvable";
    }
}

async function getWeather(lat, lon) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
        const response = await fetch(url);
        const data = await response.json();
        const temp = data.current.temperature_2m;
        const code = data.current.weather_code;
        
        let condition = "Nuageux";
        if (code === 0) condition = "Ciel dégagé";
        else if (code >= 51 && code <= 67) condition = "Pluie";
        else if (code >= 71 && code <= 77) condition = "Neige";
        else if (code >= 80 && code <= 99) condition = "Averses/Orage";

        return `${condition} (${temp}°C)`;
    } catch (error) {
        return "Météo indisponible";
    }
}

function drawTextOnCanvas(date, location, weather) {
    const barHeight = canvas.height * 0.15; // La barre noire prend 15% de la hauteur en bas
    const fontSize = canvas.height * 0.035; // Police dynamique
    const padding = canvas.width * 0.05;

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

    ctx.fillStyle = "white";
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textBaseline = "top";

    ctx.fillText(`📅 ${date}`, padding, canvas.height - barHeight + (barHeight * 0.1));
    ctx.fillText(`📍 ${location}`, padding, canvas.height - barHeight + (barHeight * 0.4));
    ctx.fillText(`☁️ ${weather}`, padding, canvas.height - barHeight + (barHeight * 0.7));
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
                    text: 'Photo annotée depuis ma PWA !'
                });
            } catch (err) {
                console.log("Partage annulé ou échoué", err);
            }
        } else {
            // Téléchargement direct si le partage n'est pas supporté (ex: sur PC)
            const link = document.createElement('a');
            link.download = `photo_${Date.now()}.jpg`;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        }
    }, 'image/jpeg', 0.9);
});