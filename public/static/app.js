// Cassius TV - Frontend Application
// Version: 2.1 - Smart Two-Button Workflow Fixed
// =====================================

// Global state
let currentView = 'home';
let libraryContent = [];
let categories = [];
let recommendations = [];
let preferences = {};

// API Base URL (will work both locally and in production)
const API_BASE = '';

// Initialize app on load
document.addEventListener('DOMContentLoaded', async () => {
  await loadPreferences();
  await loadCategories();
  await loadLibrary();
  
  // Check if we should auto-generate guide
  if (libraryContent.length === 0 && recommendations.length === 0) {
    showWelcome();
  }
});

// =====================================
// API Functions
// =====================================

async function loadPreferences() {
  try {
    const response = await axios.get(`${API_BASE}/api/preferences`);
    preferences = response.data.preferences;
  } catch (error) {
    console.error('Failed to load preferences:', error);
    // Use defaults
    preferences = {
      recommendations_per_type: 12,
      auto_refresh: true
    };
  }
}

async function loadCategories() {
  try {
    const response = await axios.get(`${API_BASE}/api/categories`);
    categories = response.data.categories || [];
    updateCategorySelects();
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

async function loadLibrary() {
  try {
    const response = await axios.get(`${API_BASE}/api/library`);
    libraryContent = response.data.content || [];
    renderLibrary();
  } catch (error) {
    console.error('Failed to load library:', error);
  }
}

async function addToLibrary(content, autoMove = false) {
  try {
    // Ensure we send the full content object with in_library flag
    const payload = {
      ...content,
      in_library: true
    };
    
    const response = await axios.post(`${API_BASE}/api/library`, payload);
    if (response.data.success) {
      await loadLibrary();
      if (!autoMove) {
        showNotification(`Added "${content.title}" to library!`, 'success');
      }
    }
  } catch (error) {
    console.error('Failed to add to library:', error);
    showNotification('Failed to add to library', 'error');
  }
}

async function removeFromLibrary(id) {
  try {
    const response = await axios.delete(`${API_BASE}/api/library/${id}`);
    if (response.data.success) {
      await loadLibrary();
      showNotification('Removed from library', 'info');
    }
  } catch (error) {
    console.error('Failed to remove from library:', error);
    showNotification('Failed to remove from library', 'error');
  }
}

async function rateContent(contentId, rating) {
  try {
    const response = await axios.post(`${API_BASE}/api/ratings`, {
      content_id: contentId,
      rating: rating
    });
    if (response.data.success) {
      showNotification(`Rated ${rating} stars`, 'success');
    }
  } catch (error) {
    console.error('Failed to rate content:', error);
    showNotification('Failed to save rating', 'error');
  }
}

// =====================================
// UI Functions
// =====================================

function showLoading(show = true) {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.classList.toggle('hidden', !show);
  }
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `fixed top-24 right-4 px-6 py-3 rounded-lg shadow-lg z-50 animate-pulse`;
  
  // Set color based on type
  const colors = {
    'success': 'bg-green-600',
    'error': 'bg-red-600',
    'info': 'bg-blue-600',
    'warning': 'bg-yellow-600'
  };
  
  notification.classList.add(colors[type] || 'bg-gray-600');
  notification.innerHTML = `
    <div class="flex items-center space-x-2">
      <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function showWelcome() {
  const container = document.getElementById('content-container');
  if (!container) return;
  
  container.innerHTML = `
    <section class="min-h-[60vh] flex items-center justify-center">
      <div class="text-center max-w-2xl">
        <i class="fas fa-tv text-6xl text-red-600 mb-6"></i>
        <h2 class="text-4xl font-bold mb-4">Welcome to Cassius TV!</h2>
        <p class="text-xl text-gray-300 mb-8">
          Your personalized free streaming guide. Let's get started by finding some great content for you!
        </p>
        <div class="space-y-4">
          <button onclick="generateGuide()" class="bg-red-600 hover:bg-red-700 px-8 py-4 rounded-lg font-semibold text-lg transition">
            <i class="fas fa-wand-magic-sparkles mr-2"></i>
            Generate My First Guide
          </button>
          <p class="text-gray-400">or</p>
          <button onclick="showAddContent()" class="bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-lg transition">
            <i class="fas fa-plus mr-2"></i>
            Add Content Manually
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderLibrary() {
  const grid = document.getElementById('library-grid');
  if (!grid) return;
  
  if (libraryContent.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12">
        <i class="fas fa-bookmark text-4xl text-gray-600 mb-4"></i>
        <p class="text-gray-400">Your library is empty</p>
        <button onclick="generateGuide()" class="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition">
          Discover Content
        </button>
      </div>
    `;
    return;
  }
  
  // Separate items with URLs from those without
  const withUrls = libraryContent.filter(item => item.stream_url && item.stream_url !== '');
  const withoutUrls = libraryContent.filter(item => !item.stream_url || item.stream_url === '');
  
  let html = '';
  
  // Show items with URLs first
  if (withUrls.length > 0) {
    html += `
      <div class="col-span-full mb-4">
        <h3 class="text-lg font-bold text-green-600">
          <i class="fas fa-check-circle mr-2"></i>
          Ready to Watch (${withUrls.length})
        </h3>
      </div>
      ${withUrls.map(item => createContentCard(item, true)).join('')}
    `;
  }
  
  // Then show items needing URLs
  if (withoutUrls.length > 0) {
    html += `
      <div class="col-span-full mb-4 ${withUrls.length > 0 ? 'mt-8' : ''}">
        <h3 class="text-lg font-bold text-yellow-600">
          <i class="fas fa-search mr-2"></i>
          Need Stream URLs (${withoutUrls.length})
        </h3>
        <p class="text-sm text-gray-400 mt-1">
          Search for these titles and add working stream URLs
        </p>
      </div>
      ${withoutUrls.map(item => createContentCard(item, true)).join('')}
    `;
  }
  
  grid.innerHTML = html;
}

function createContentCard(content, inLibrary = false) {
  const posterUrl = content.poster_url || '/static/placeholder-poster.jpg';
  const typeIcon = content.type === 'movie' ? 'film' : 'tv';
  const hasStreamUrl = content.stream_url && content.stream_url !== '' && content.stream_url !== 'null';
  const contentId = content.id || `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return `
    <div class="content-card bg-gray-800 rounded-lg overflow-hidden group relative" data-content-id="${contentId}">
      <!-- Status Badge -->
      ${!inLibrary && !hasStreamUrl ? `
        <div class="absolute top-2 left-2 z-10">
          <span class="bg-yellow-600/90 text-xs px-2 py-1 rounded-full">
            <i class="fas fa-search mr-1"></i>Needs URL
          </span>
        </div>
      ` : ''}
      ${inLibrary && hasStreamUrl ? `
        <div class="absolute top-2 left-2 z-10">
          <span class="bg-green-600/90 text-xs px-2 py-1 rounded-full">
            <i class="fas fa-check mr-1"></i>Ready
          </span>
        </div>
      ` : ''}
      
      <!-- Poster -->
      <div class="aspect-[2/3] bg-gray-700 relative">
        ${content.poster_url ? 
          `<img src="${posterUrl}" alt="${content.title}" class="w-full h-full object-cover">` :
          `<div class="w-full h-full flex items-center justify-center">
            <i class="fas fa-${typeIcon} text-4xl text-gray-600"></i>
          </div>`
        }
        
        <!-- Overlay on hover -->
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div class="absolute bottom-0 left-0 right-0 p-3">
            <!-- Action buttons -->
            <div class="flex flex-col space-y-2">
              
              <!-- Primary Actions Row -->
              <div class="flex justify-center space-x-2">
                <!-- Search for Stream -->
                <button onclick="searchForStream('${content.title}')" class="bg-red-600 text-white rounded-lg px-3 py-2 flex items-center hover:bg-red-700 transition text-sm font-semibold">
                  <i class="fas fa-search mr-1"></i>
                  Find Stream
                </button>
                
                <!-- Add URL (for recommendations) or Play (for library items with URL) -->
                ${!inLibrary ? `
                  <button onclick="promptForStreamUrl(${JSON.stringify(content).replace(/"/g, '&quot;')})" class="bg-green-600 text-white rounded-lg px-3 py-2 flex items-center hover:bg-green-700 transition text-sm font-semibold">
                    <i class="fas fa-link mr-1"></i>
                    Add URL
                  </button>
                ` : hasStreamUrl ? `
                  <button onclick="playContent('${content.stream_url}')" class="bg-green-600 text-white rounded-lg px-3 py-2 flex items-center hover:bg-green-700 transition text-sm font-semibold">
                    <i class="fas fa-play mr-1"></i>
                    Play
                  </button>
                ` : `
                  <button onclick="promptForStreamUrl(${JSON.stringify(content).replace(/"/g, '&quot;')})" class="bg-yellow-600 text-white rounded-lg px-3 py-2 flex items-center hover:bg-yellow-700 transition text-sm font-semibold">
                    <i class="fas fa-link mr-1"></i>
                    Add URL
                  </button>
                `}
              </div>
              
              <!-- Secondary Actions Row -->
              <div class="flex justify-center space-x-2">
                ${!inLibrary ? `
                  <button onclick="addToLibrary(${JSON.stringify(content).replace(/"/g, '&quot;')})" class="bg-gray-700/80 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-gray-600 transition" title="Save to Library">
                    <i class="fas fa-bookmark text-sm"></i>
                  </button>
                ` : `
                  <button onclick="removeFromLibrary(${content.id})" class="bg-gray-700/80 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition" title="Remove from Library">
                    <i class="fas fa-trash text-sm"></i>
                  </button>
                `}
                
                <!-- iWebTV Cast (only if has URL) -->
                ${hasStreamUrl ? `
                  <button onclick="castToTV('${content.stream_url}')" class="bg-blue-600/80 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-blue-500 transition" title="Cast to TV">
                    <i class="fas fa-cast text-sm"></i>
                  </button>
                ` : ''}
              </div>
            </div>
            
            <!-- Rating stars -->
            <div class="star-rating flex justify-center space-x-1 mt-2" data-content-id="${contentId}">
              ${[1,2,3,4,5].map(star => `
                <i class="fas fa-star star text-sm cursor-pointer hover:text-yellow-500" 
                   onclick="rateContent('${contentId}', ${star})"></i>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
      
      <!-- Title and Info -->
      <div class="p-3">
        <h4 class="text-sm font-semibold truncate" title="${content.title}">${content.title}</h4>
        <div class="flex items-center justify-between mt-1">
          <span class="text-xs text-gray-400">
            <i class="fas fa-${typeIcon} mr-1"></i>
            ${content.type === 'movie' ? 'Movie' : 'TV Show'}
          </span>
          ${content.release_year ? `
            <span class="text-xs text-gray-400">${content.release_year}</span>
          ` : ''}
        </div>
        ${content.provider ? `
          <div class="text-xs text-gray-500 mt-1">
            <i class="fas fa-tv mr-1"></i>${content.provider}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function updateCategorySelects() {
  const selects = document.querySelectorAll('select[name="category"]');
  selects.forEach(select => {
    select.innerHTML = `
      <option value="">Select Category...</option>
      ${categories.map(cat => `
        <option value="${cat.id}">${cat.name}</option>
      `).join('')}
    `;
  });
}

// =====================================
// Action Functions  
// =====================================

async function generateGuide() {
  showLoading(true);
  
  try {
    // Call the discovery API
    const response = await axios.post(`${API_BASE}/api/discover`);
    
    if (response.data.success) {
      const { movies, tvShows } = response.data;
      
      // Combine and store recommendations
      recommendations = [...movies, ...tvShows];
      
      // Render recommendations
      renderRecommendations();
      
      showNotification(`Found ${movies.length} movies and ${tvShows.length} TV shows!`, 'success');
    } else {
      showNotification(`Found ${response.data.total || 0} recommendations`, 'warning');
    }
  } catch (error) {
    console.error('Discovery error:', error);
    
    // Check if it's an API key issue
    if (error.response?.data?.error?.includes('API key')) {
      showNotification(error.response.data.message || 'Please configure API keys in .dev.vars file', 'error');
    } else {
      showNotification('Failed to generate guide. Please try again.', 'error');
    }
  } finally {
    showLoading(false);
  }
}

function renderRecommendations() {
  const grid = document.getElementById('recommendations-grid');
  if (!grid || recommendations.length === 0) return;
  
  // Separate movies and TV shows
  const movies = recommendations.filter(item => item.type === 'movie');
  const tvShows = recommendations.filter(item => item.type === 'tv');
  
  let html = '';
  
  // Add section for movies if any
  if (movies.length > 0) {
    html += `
      <div class="col-span-full mb-4">
        <h3 class="text-xl font-bold text-red-600">
          <i class="fas fa-film mr-2"></i>
          Recommended Movies (${movies.length})
        </h3>
        <p class="text-sm text-gray-400 mt-1">
          Click "Find Stream" to search, then "Add URL" when you find a working link
        </p>
      </div>
      ${movies.map(item => createContentCard(item, false)).join('')}
    `;
  }
  
  // Add section for TV shows if any
  if (tvShows.length > 0) {
    html += `
      <div class="col-span-full mb-4 mt-8">
        <h3 class="text-xl font-bold text-blue-600">
          <i class="fas fa-tv mr-2"></i>
          Recommended TV Shows (${tvShows.length})
        </h3>
        <p class="text-sm text-gray-400 mt-1">
          Search for free episodes, then save the stream URL to your library
        </p>
      </div>
      ${tvShows.map(item => createContentCard(item, false)).join('')}
    `;
  }
  
  grid.innerHTML = html;
}

function playContent(url) {
  if (!url || url === 'null' || url === '') {
    showNotification('No stream URL available - use "Find Stream" button instead', 'error');
    return;
  }
  
  // Open stream URL in new tab
  window.open(url, '_blank');
  showNotification('Opening stream...', 'success');
}

// New function: Search for free stream
function searchForStream(title) {
  const searchQuery = `${title} free stream watch online`;
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
  
  window.open(searchUrl, '_blank');
  showNotification('Searching for free streams...', 'info');
}

// New function: Prompt user for stream URL
async function promptForStreamUrl(content) {
  // Create a modal for URL input
  const modalHtml = `
    <div id="url-input-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div class="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-xl font-bold mb-4">
          <i class="fas fa-link mr-2 text-red-600"></i>
          Add Stream URL for "${content.title}"
        </h3>
        
        <p class="text-gray-400 text-sm mb-4">
          Found a working stream? Paste the URL below:
        </p>
        
        <input 
          type="url" 
          id="stream-url-input" 
          class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-red-600 focus:outline-none"
          placeholder="https://..." 
          value="${content.stream_url || ''}"
        >
        
        <div class="flex justify-end space-x-3 mt-6">
          <button 
            onclick="closeUrlModal()" 
            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
          >
            Cancel
          </button>
          <button 
            onclick="saveStreamUrl(${JSON.stringify(content).replace(/"/g, '&quot;')})" 
            class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition font-semibold"
          >
            <i class="fas fa-save mr-2"></i>
            Save & Add to Library
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to page
  const modalDiv = document.createElement('div');
  modalDiv.innerHTML = modalHtml;
  document.body.appendChild(modalDiv);
  
  // Focus the input
  setTimeout(() => {
    document.getElementById('stream-url-input')?.focus();
  }, 100);
}

// Close URL modal
function closeUrlModal() {
  const modal = document.getElementById('url-input-modal');
  if (modal) {
    modal.parentElement.remove();
  }
}

// Save stream URL and add to library
async function saveStreamUrl(content) {
  const urlInput = document.getElementById('stream-url-input');
  const streamUrl = urlInput?.value.trim();
  
  if (!streamUrl) {
    showNotification('Please enter a valid URL', 'error');
    return;
  }
  
  // Close modal first
  closeUrlModal();
  
  // Update content with URL
  content.stream_url = streamUrl;
  content.in_library = true;
  
  // Save to library
  await addToLibrary(content, true);
  
  showNotification(`Added "${content.title}" to library with stream URL!`, 'success');
  
  // Refresh the view
  await loadLibrary();
  
  // Remove from recommendations if it was there
  recommendations = recommendations.filter(r => r.title !== content.title);
  renderRecommendations();
}

// Search on multiple free streaming sites (keeping as backup)
function searchAllSites(title) {
  const sites = [
    `https://tubitv.com/search?q=${encodeURIComponent(title)}`,
    `https://www.roku.com/whats-on/search/${encodeURIComponent(title)}`,
    `https://pluto.tv/en/search?query=${encodeURIComponent(title)}`,
    `https://www.crackle.com/search?q=${encodeURIComponent(title)}`,
    `https://watch.plex.tv/search?query=${encodeURIComponent(title)}`
  ];
  
  showNotification('Searching 5 free streaming sites...', 'info');
  
  // Open first site immediately, others with slight delay
  sites.forEach((url, index) => {
    setTimeout(() => {
      window.open(url, '_blank');
    }, index * 500);
  });
}

function castToTV(url) {
  if (!url) {
    showNotification('No stream URL available', 'error');
    return;
  }
  
  // Copy URL to clipboard
  navigator.clipboard.writeText(url).then(() => {
    showNotification('Stream URL copied to clipboard', 'success');
    
    // Try to open iWebTV app
    const iWebTVUrl = `iwebtv://play?url=${encodeURIComponent(url)}`;
    window.location.href = iWebTVUrl;
    
    // Fallback message after 1 second if app doesn't open
    setTimeout(() => {
      showNotification('Open iWebTV and paste the URL', 'info');
    }, 1000);
  }).catch(err => {
    console.error('Failed to copy URL:', err);
    showNotification('Failed to copy URL', 'error');
  });
}

function showAddContent() {
  const modal = document.getElementById('add-content-modal');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function closeAddContent() {
  const modal = document.getElementById('add-content-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  
  // Reset form
  const form = document.getElementById('add-content-form');
  if (form) {
    form.reset();
  }
}

function showSettings() {
  showNotification('Settings page coming soon!', 'info');
  // TODO: Implement settings page
}

// Test movie button
function testMovies() {
  showNotification('TEST: Movies button works!', 'success');
}

// Test TV button
function testTVShows() {
  showNotification('TEST: TV Shows button works!', 'success');
}