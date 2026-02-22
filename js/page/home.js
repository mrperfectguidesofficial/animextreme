import { fetchAnimeByCategory, searchAnime } from '../api/jikan.js';

let currentHomeCategory = 'trending';
let currentHomePageNum = 1;
let isSearchMode = false;

export async function loadHomePage() {
    if (!isSearchMode) await fetchAnimeByCategory(currentHomeCategory, currentHomePageNum);
}

export function switchHomeTab(category) {
    document.querySelectorAll('#homePage .filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${category}`).classList.add('active');
    currentHomeCategory = category;
    currentHomePageNum = 1; 
    isSearchMode = false;
    document.getElementById('searchInput').value = ''; 
    const titles = { 'trending': 'Trending Now', 'new': 'Currently Airing', 'upcoming': 'Upcoming Anime', 'all': 'All Anime Archive' };
    document.getElementById('sectionTitle').innerText = titles[category];
    fetchAnimeByCategory(category, 1);
}

export async function changePage(direction) {
    const grid = document.getElementById('animeGrid');
    grid.innerHTML = ''; 
    if (direction === 'next') currentHomePageNum++;
    else if (direction === 'prev' && currentHomePageNum > 1) currentHomePageNum--;
    document.getElementById('pageIndicator').innerText = `Page ${currentHomePageNum}`;
    
    if (isSearchMode) {
        await searchAnime(document.getElementById('searchInput').value, currentHomePageNum);
    } else {
        await fetchAnimeByCategory(currentHomeCategory, currentHomePageNum);
    }
    document.querySelector('#homePage .page-container').scrollTop = 0;
}

// Attach to window for inline event handlers
window.switchHomeTab = switchHomeTab;
window.changePage = changePage;
window.searchAnime = searchAnime;