import { db } from '../api/firebase.js';
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { closeModal, openModal } from '../api/utils.js';

let allAnime = [];

export function loadWatchlist() {
    const container = document.getElementById('listContainer');
    const loading = document.getElementById('watchlistLoading');
    const emptyState = document.getElementById('emptyState');
    
    onSnapshot(collection(db, "users", window.currentUser.uid, "watchlist"), (snapshot) => {
        allAnime = [];
        snapshot.forEach(doc => allAnime.push({ id: doc.id, ...doc.data() }));
        
        loading.classList.add('hidden');
        
        const activeBtn = document.querySelector('#watchlistPage .filter-btn.active');
        const filter = activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
        renderList(filter);
    });
}

export function filterList(status, btn) {
    document.querySelectorAll('#watchlistPage .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderList(status);
}

export function renderList(filter) {
    const container = document.getElementById('listContainer');
    container.innerHTML = '';
    allAnime.sort((a, b) => (b.addedAt?.seconds || 0) - (a.addedAt?.seconds || 0));
    const filtered = filter === 'all' ? allAnime : allAnime.filter(a => a.status === filter);
    if(filtered.length === 0) {
        document.getElementById('emptyState').classList.remove('hidden');
        return;
    }
    document.getElementById('emptyState').classList.add('hidden');
    
    filtered.forEach(anime => {
        const watched = anime.watchedEpisodes || 0;
        const total = anime.totalEpisodes || 0;
        const score = anime.userScore || 0;
        let progress = total > 0 ? (watched / total) * 100 : 0;
        progress = Math.round(progress);

        let barColor = '#2979ff'; // Watching (Blue)
        if(anime.status === 'completed') barColor = '#00e676';
        if(anime.status === 'plan') barColor = '#ffab00';

        const div = document.createElement('div'); div.className = 'mal-card';
        div.style.borderLeftColor = barColor;
        
        const minusBtn = document.createElement('button'); minusBtn.className = 'ctrl-btn'; minusBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
        minusBtn.onclick = (e) => { e.stopPropagation(); updateEp(anime.id, -1); };

        const plusBtn = document.createElement('button'); plusBtn.className = 'ctrl-btn'; plusBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        plusBtn.onclick = (e) => { e.stopPropagation(); updateEp(anime.id, 1); };

        const isPlan = anime.status === 'plan';
        const rateBtn = `<button class="btn-rate" ${isPlan ? 'style="opacity:0.3; pointer-events:none;"' : `onclick="event.stopPropagation(); window.openRateModal('${anime.id}')"`}>${score > 0 ? score : '<i class="fa-regular fa-star"></i>'}</button>`;

        div.innerHTML = `
            <img src="${anime.image}" class="mal-img">
            <div class="mal-info">
                <div class="mal-title">${anime.title}</div>
                <div class="mal-meta">
                    <span style="text-transform:capitalize;">${anime.status}</span> • ${progress}%
                </div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
                ${rateBtn}
                <div class="ep-control-box"></div>
            </div>
            <div class="progress-line" style="width:${progress}%; background:${barColor}"></div>
        `;
        
        const epBox = div.querySelector('.ep-control-box');
        epBox.appendChild(minusBtn);
        epBox.innerHTML += `<div class="ep-display">${watched} <span style="opacity:0.6;font-size:10px;">/ ${total||'?'}</span></div>`;
        epBox.appendChild(plusBtn);

        div.addEventListener('click', () => window.navigateTo('details', { id: anime.id }));
        
        let pressTimer;
        div.addEventListener('touchstart', (e) => {
            if(!e.target.closest('button')) {
                div.style.transform="scale(0.96)";
                pressTimer = setTimeout(() => {
                    div.style.transform="scale(1)";
                    openDeleteModal(anime.id, anime.title);
                }, 600);
            }
        });
        div.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
            div.style.transform="scale(1)";
        });

        container.appendChild(div);
    });
}

export async function updateEp(id, change) {
    const index = allAnime.findIndex(a => String(a.id) === String(id));
    if(index === -1) return;
    let anime = allAnime[index];
    
    let current = anime.watchedEpisodes || 0;
    const total = anime.totalEpisodes || 0;
    let newVal = current + change;

    if(newVal < 0) newVal = 0;
    if(total > 0 && newVal > total) newVal = total;

    let newStatus = anime.status;
    let progress = total > 0 ? (newVal / total) * 100 : 0;

    if (progress >= 100) newStatus = 'completed';
    else if (newVal > 0) newStatus = 'watching';
    else if (newVal === 0) newStatus = 'plan';

    try {
        await updateDoc(doc(db, "users", window.currentUser.uid, "watchlist", String(id)), {
            watchedEpisodes: newVal,
            status: newStatus
        });
    } catch (e) {
        console.error(e);
    }
}

export function openDeleteModal(id, title) {
    document.getElementById('deleteId').value = id;
    document.getElementById('deleteTitle').innerText = `Remove "${title}"?`;
    openModal('deleteModal');
}

export async function confirmDelete() {
    const id = document.getElementById('deleteId').value;
    await deleteDoc(doc(db, "users", window.currentUser.uid, "watchlist", String(id)));
    closeModal('deleteModal');
}

export function openRateModal(id) {
    const anime = allAnime.find(a => String(a.id) === String(id));
    if(!anime) return;
    document.getElementById('rateId').value = id;
    document.getElementById('rateTitle').innerText = anime.title;
    document.getElementById('scoreSelector').value = anime.userScore || 0;
    openModal('rateModal');
}

export async function saveRating() {
    const id = document.getElementById('rateId').value;
    const newScore = parseInt(document.getElementById('scoreSelector').value);
    await updateDoc(doc(db, "users", window.currentUser.uid, "watchlist", String(id)), { userScore: newScore });
    closeModal('rateModal');
}

// Attach to window
window.filterList = filterList;
window.renderList = renderList;
window.updateEp = updateEp;
window.openDeleteModal = openDeleteModal;
window.confirmDelete = confirmDelete;
window.openRateModal = openRateModal;
window.saveRating = saveRating;