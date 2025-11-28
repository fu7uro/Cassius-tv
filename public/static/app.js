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
        <!-- Delete Stream URL Button -->
        <div class="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onclick="confirmDeleteStreamUrl(${content.id}, '${content.title}')" class="bg-red-600/90 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center transition" title="Delete Stream URL">
            <i class="fas fa-trash text-sm"></i>
          </button>
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

// Category definitions
const CATEGORIES = [
  { value: 'tv-drama', label: 'TV Show - Drama', type: 'tv', genre: 'Drama' },
  { value: 'tv-comedy', label: 'TV Show - Comedy', type: 'tv', genre: 'Comedy' },
  { value: 'tv-action', label: 'TV Show - Action', type: 'tv', genre: 'Action' },
  { value: 'tv-thriller', label: 'TV Show - Thriller', type: 'tv', genre: 'Thriller' },
  { value: 'tv-documentary', label: 'TV Show - Documentary', type: 'tv', genre: 'Documentary' },
  { value: 'movie-drama', label: 'Movie - Drama', type: 'movie', genre: 'Drama' },
  { value: 'movie-comedy', label: 'Movie - Comedy', type: 'movie', genre: 'Comedy' },
  { value: 'movie-action', label: 'Movie - Action', type: 'movie', genre: 'Action' },
  { value: 'movie-thriller', label: 'Movie - Thriller', type: 'movie', genre: 'Thriller' },
  { value: 'movie-crime', label: 'Movie - Crime', type: 'movie', genre: 'Crime' },
  { value: 'movie-horror', label: 'Movie - Horror', type: 'movie', genre: 'Horror' },
  { value: 'sports-ufc', label: 'Sports - UFC', type: 'sports', genre: 'UFC' },
  { value: 'sports-football', label: 'Sports - Football', type: 'sports', genre: 'Football' },
  { value: 'sports-basketball', label: 'Sports - Basketball', type: 'sports', genre: 'Basketball' }
];

// New function: Prompt user for stream URL with category selection
async function promptForStreamUrl(content) {
  // Auto-detect category if genre exists
  let selectedCategory = '';
  if (content.genre && content.type) {
    const category = CATEGORIES.find(cat => 
      cat.type === content.type && 
      cat.genre.toLowerCase() === content.genre.toLowerCase()
    );
    if (category) selectedCategory = category.value;
  }
  
  // Create a modal for URL input
  const modalHtml = `
    <div id="url-input-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div class="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-xl font-bold mb-4">
          <i class="fas fa-link mr-2 text-red-600"></i>
          Add Stream URL for "${content.title}"
        </h3>
        
        <p class="text-gray-400 text-sm mb-4">
          Found a working stream? Paste the URL and select a category:
        </p>
        
        <!-- URL Input -->
        <div class="mb-4">
          <label class="block text-sm text-gray-400 mb-2">Stream URL</label>
          <input 
            type="url" 
            id="stream-url-input" 
            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-red-600 focus:outline-none"
            placeholder="https://..." 
            value="${content.stream_url || ''}"
          >
        </div>
        
        <!-- Category Dropdown -->
        <div class="mb-6">
          <label class="block text-sm text-gray-400 mb-2">
            <i class="fas fa-tag mr-1"></i>
            Category
          </label>
          <select 
            id="category-select" 
            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-red-600 focus:outline-none"
          >
            <option value="">Select a category...</option>
            <optgroup label="TV Shows">
              ${CATEGORIES.filter(c => c.type === 'tv').map(cat => `
                <option value="${cat.value}" ${cat.value === selectedCategory ? 'selected' : ''}>${cat.label}</option>
              `).join('')}
            </optgroup>
            <optgroup label="Movies">
              ${CATEGORIES.filter(c => c.type === 'movie').map(cat => `
                <option value="${cat.value}" ${cat.value === selectedCategory ? 'selected' : ''}>${cat.label}</option>
              `).join('')}
            </optgroup>
            <optgroup label="Sports">
              ${CATEGORIES.filter(c => c.type === 'sports').map(cat => `
                <option value="${cat.value}" ${cat.value === selectedCategory ? 'selected' : ''}>${cat.label}</option>
              `).join('')}
            </optgroup>
          </select>
        </div>
        
        <div class="flex justify-end space-x-3">
          <button 
            onclick="closeUrlModal()" 
            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
          >
            Cancel
          </button>
          <button 
            onclick="saveStreamUrlWithCategory(${JSON.stringify(content).replace(/"/g, '&quot;')})" 
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

// Save stream URL with category and add to library
async function saveStreamUrlWithCategory(content) {
  const urlInput = document.getElementById('stream-url-input');
  const categorySelect = document.getElementById('category-select');
  const streamUrl = urlInput?.value.trim();
  const categoryValue = categorySelect?.value;
  
  if (!streamUrl) {
    showNotification('Please enter a valid URL', 'error');
    return;
  }
  
  if (!categoryValue) {
    showNotification('Please select a category', 'error');
    return;
  }
  
  // Close modal first
  closeUrlModal();
  
  // Find the selected category details
  const category = CATEGORIES.find(c => c.value === categoryValue);
  
  // Update content with URL, type, and genre from category
  content.stream_url = streamUrl;
  content.in_library = true;
  content.type = category.type;
  content.genre = category.genre;
  content.category = categoryValue; // Store full category value
  
  // Save to library
  await addToLibrary(content, true);
  
  showNotification(`Added "${content.title}" to ${category.label}!`, 'success');
  
  // Refresh the view
  await loadLibrary();
  
  // Remove from recommendations if it was there
  recommendations = recommendations.filter(r => r.title !== content.title);
  renderRecommendations();
}

// Backward compatibility: Old function redirects to new one
async function saveStreamUrl(content) {
  return saveStreamUrlWithCategory(content);
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
    
    // Setup form submission handler
    const form = document.getElementById('add-content-form');
    if (form) {
      form.onsubmit = handleAddContentSubmit;
    }
  }
}

function closeAddContent() {
  const modal = document.getElementById('add-content-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  
  // Reset form and preview
  const form = document.getElementById('add-content-form');
  if (form) {
    form.reset();
  }
  
  const preview = document.getElementById('poster-preview');
  if (preview) {
    preview.innerHTML = '<i class="fas fa-image text-3xl text-gray-600"></i>';
  }
  
  document.getElementById('poster-data').value = '';
}

// Handle image upload from device
function handleImageUpload(input) {
  const file = input.files[0];
  if (!file) return;
  
  // Check file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showNotification('Image too large! Please choose an image under 5MB', 'error');
    return;
  }
  
  // Check file type
  if (!file.type.startsWith('image/')) {
    showNotification('Please select an image file', 'error');
    return;
  }
  
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const base64Data = e.target.result;
    
    // Store base64 data
    document.getElementById('poster-data').value = base64Data;
    
    // Show preview
    const preview = document.getElementById('poster-preview');
    if (preview) {
      preview.innerHTML = `<img src="${base64Data}" alt="Preview" class="w-full h-full object-cover">`;
    }
    
    showNotification('Image loaded successfully!', 'success');
  };
  
  reader.onerror = function() {
    showNotification('Failed to load image', 'error');
  };
  
  reader.readAsDataURL(file);
}

// Handle form submission
async function handleAddContentSubmit(e) {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  
  // Build content object - simple version without category dropdown
  const content = {
    title: formData.get('title'),
    type: formData.get('type'),
    genre: formData.get('genre') || null,
    stream_url: formData.get('stream_url'),
    release_year: formData.get('release_year') || null,
    overview: formData.get('overview') || null,
    poster_url: document.getElementById('poster-data').value || null,
    in_library: true,
    source: 'manual'
  };
  
  console.log('Submitting content:', content);
  
  try {
    const response = await axios.post(`${API_BASE}/api/library`, content);
    
    if (response.data.success) {
      showNotification(`Added "${content.title}" to library!`, 'success');
      closeAddContent();
      await loadLibrary();
    } else {
      showNotification('Failed to add content', 'error');
    }
  } catch (error) {
    console.error('Error adding content:', error);
    showNotification('Failed to add content: ' + (error.response?.data?.error || error.message), 'error');
  }
}

function showSettings() {
  showNotification('Settings page coming soon!', 'info');
  // TODO: Implement settings page
}

// Category Navigation Functions
function showMoviesByGenre(genre) {
  console.log('Filtering movies by genre:', genre);
  console.log('Library content:', libraryContent.length, 'items');
  console.log('Sample items:', libraryContent.slice(0, 3).map(i => ({ title: i.title, type: i.type, genre: i.genre })));
  
  const filtered = libraryContent.filter(item => 
    item.type === 'movie' && item.genre === genre
  );
  
  console.log('Filtered results:', filtered.length, 'items');
  renderCategoryView('Movies', genre, filtered);
}

function showTVByGenre(genre) {
  const filtered = libraryContent.filter(item => 
    item.type === 'tv' && item.genre === genre
  );
  
  renderCategoryView('TV Shows', genre, filtered);
}

function showSportsByType(sport) {
  const filtered = libraryContent.filter(item => 
    item.type === 'sports' && item.genre === sport
  );
  
  renderCategoryView('Sports', sport, filtered);
}

function renderCategoryView(mainType, subType, content) {
  const grid = document.getElementById('library-grid');
  if (!grid) return;
  
  if (content.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12">
        <i class="fas fa-folder-open text-4xl text-gray-600 mb-4"></i>
        <p class="text-gray-400">No ${subType} ${mainType.toLowerCase()} in your library yet</p>
        <button onclick="generateGuide()" class="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition">
          Discover Content
        </button>
      </div>
    `;
    return;
  }
  
  // Separate by URL status
  const withUrls = content.filter(item => item.stream_url && item.stream_url !== '');
  const withoutUrls = content.filter(item => !item.stream_url || item.stream_url === '');
  
  let html = `
    <div class="col-span-full mb-6">
      <h2 class="text-3xl font-bold bg-gradient-to-r from-red-600 to-gray-400 bg-clip-text text-transparent">
        <i class="fas fa-${mainType === 'Movies' ? 'film' : mainType === 'TV Shows' ? 'tv' : 'football'} mr-2"></i>
        ${mainType} - ${subType}
      </h2>
      <p class="text-gray-400 mt-2">Showing ${content.length} item${content.length !== 1 ? 's' : ''}</p>
    </div>
  `;
  
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
  
  if (withoutUrls.length > 0) {
    html += `
      <div class="col-span-full mb-4 ${withUrls.length > 0 ? 'mt-8' : ''}">
        <h3 class="text-lg font-bold text-yellow-600">
          <i class="fas fa-search mr-2"></i>
          Need Stream URLs (${withoutUrls.length})
        </h3>
      </div>
      ${withoutUrls.map(item => createContentCard(item, true)).join('')}
    `;
  }
  
  grid.innerHTML = html;
}

// Show all movies (any genre)
function showMovies() {
  const filtered = libraryContent.filter(item => item.type === 'movie');
  renderCategoryView('Movies', 'All Genres', filtered);
}

// Show all TV shows (any genre)
function showTVShows() {
  const filtered = libraryContent.filter(item => item.type === 'tv');
  renderCategoryView('TV Shows', 'All Genres', filtered);
}

// Show all sports
function showSports() {
  const filtered = libraryContent.filter(item => item.type === 'sports');
  renderCategoryView('Sports', 'All Types', filtered);
}

// Show home/recommendations
function showHome() {
  const container = document.getElementById('content-container');
  if (container) {
    if (recommendations.length > 0) {
      renderRecommendations();
    } else {
      showWelcome();
    }
  }
}

// Show library
function showLibrary() {
  renderLibrary();
}

// =====================================
// Search Functionality
// =====================================

let searchQuery = '';

function toggleSearch() {
  const searchContainer = document.getElementById('search-container');
  if (!searchContainer) {
    createSearchUI();
  } else {
    searchContainer.remove();
  }
}

function createSearchUI() {
  const searchHtml = `
    <div id="search-container" class="fixed top-20 right-4 z-40 bg-gray-900 rounded-lg shadow-xl p-4 w-80 animate-fade-in">
      <div class="flex items-center space-x-2">
        <input 
          type="text" 
          id="search-input" 
          class="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-red-600 focus:outline-none" 
          placeholder="Search library..."
          onkeyup="handleSearchInput(event)"
        >
        <button onclick="toggleSearch()" class="bg-gray-700 hover:bg-gray-600 rounded-lg w-10 h-10 flex items-center justify-center transition">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="mt-2 flex flex-wrap gap-2">
        <button onclick="filterByType('all')" class="search-filter-btn px-3 py-1 text-sm rounded-full bg-gray-700 hover:bg-red-600 transition" data-type="all">All</button>
        <button onclick="filterByType('movie')" class="search-filter-btn px-3 py-1 text-sm rounded-full bg-gray-700 hover:bg-red-600 transition" data-type="movie">Movies</button>
        <button onclick="filterByType('tv')" class="search-filter-btn px-3 py-1 text-sm rounded-full bg-gray-700 hover:bg-red-600 transition" data-type="tv">TV Shows</button>
        <button onclick="filterByStatus('with-url')" class="search-filter-btn px-3 py-1 text-sm rounded-full bg-gray-700 hover:bg-green-600 transition" data-status="with-url">Ready</button>
        <button onclick="filterByStatus('no-url')" class="search-filter-btn px-3 py-1 text-sm rounded-full bg-gray-700 hover:bg-yellow-600 transition" data-status="no-url">Need URL</button>
      </div>
      <div id="search-results" class="mt-3 text-sm text-gray-400"></div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', searchHtml);
  document.getElementById('search-input')?.focus();
}

function handleSearchInput(event) {
  searchQuery = event.target.value.toLowerCase();
  performSearch();
}

function filterByType(type) {
  // Update active button styling
  document.querySelectorAll('[data-type]').forEach(btn => {
    btn.classList.toggle('bg-red-600', btn.dataset.type === type);
  });
  
  const filtered = type === 'all' 
    ? libraryContent 
    : libraryContent.filter(item => item.type === type);
  
  renderFilteredLibrary(filtered);
}

function filterByStatus(status) {
  // Update active button styling
  document.querySelectorAll('[data-status]').forEach(btn => {
    btn.classList.toggle('bg-green-600', btn.dataset.status === status && status === 'with-url');
    btn.classList.toggle('bg-yellow-600', btn.dataset.status === status && status === 'no-url');
  });
  
  const filtered = status === 'with-url'
    ? libraryContent.filter(item => item.stream_url && item.stream_url !== '')
    : libraryContent.filter(item => !item.stream_url || item.stream_url === '');
  
  renderFilteredLibrary(filtered);
}

function performSearch() {
  if (!searchQuery) {
    renderLibrary();
    document.getElementById('search-results').innerHTML = '';
    return;
  }
  
  const filtered = libraryContent.filter(item => 
    item.title.toLowerCase().includes(searchQuery) ||
    (item.genre && item.genre.toLowerCase().includes(searchQuery)) ||
    (item.provider && item.provider.toLowerCase().includes(searchQuery))
  );
  
  renderFilteredLibrary(filtered);
  
  // Update search results count
  const resultsEl = document.getElementById('search-results');
  if (resultsEl) {
    resultsEl.innerHTML = `Found ${filtered.length} result${filtered.length !== 1 ? 's' : ''}`;
  }
}

function renderFilteredLibrary(filtered) {
  const grid = document.getElementById('library-grid');
  if (!grid) return;
  
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12">
        <i class="fas fa-search text-4xl text-gray-600 mb-4"></i>
        <p class="text-gray-400">No results found</p>
        <button onclick="clearSearch()" class="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition">
          Clear Search
        </button>
      </div>
    `;
    return;
  }
  
  // Group by status like in normal library view
  const withUrls = filtered.filter(item => item.stream_url && item.stream_url !== '');
  const withoutUrls = filtered.filter(item => !item.stream_url || item.stream_url === '');
  
  let html = '';
  
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
  
  if (withoutUrls.length > 0) {
    html += `
      <div class="col-span-full mb-4 ${withUrls.length > 0 ? 'mt-8' : ''}">
        <h3 class="text-lg font-bold text-yellow-600">
          <i class="fas fa-search mr-2"></i>
          Need Stream URLs (${withoutUrls.length})
        </h3>
      </div>
      ${withoutUrls.map(item => createContentCard(item, true)).join('')}
    `;
  }
  
  grid.innerHTML = html;
}

function clearSearch() {
  searchQuery = '';
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  renderLibrary();
  const resultsEl = document.getElementById('search-results');
  if (resultsEl) resultsEl.innerHTML = '';
}

// =====================================
// Delete Stream URL Functionality
// =====================================

function confirmDeleteStreamUrl(contentId, title) {
  const modalHtml = `
    <div id="delete-confirmation-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div class="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-xl font-bold mb-4">
          <i class="fas fa-exclamation-triangle mr-2 text-yellow-600"></i>
          Delete Stream URL?
        </h3>
        
        <p class="text-gray-300 mb-2">
          Are you sure you want to delete the stream URL for:
        </p>
        <p class="text-white font-semibold mb-4">
          "${title}"
        </p>
        <p class="text-gray-400 text-sm mb-6">
          The item will remain in your library, but you'll need to add a new stream URL to watch it.
        </p>
        
        <div class="flex justify-end space-x-3">
          <button 
            onclick="closeDeleteModal()" 
            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
          >
            Cancel
          </button>
          <button 
            onclick="deleteStreamUrl(${contentId})" 
            class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition font-semibold"
          >
            <i class="fas fa-trash mr-2"></i>
            Delete URL
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeDeleteModal() {
  const modal = document.getElementById('delete-confirmation-modal');
  if (modal) modal.remove();
}

async function deleteStreamUrl(contentId) {
  closeDeleteModal();
  
  try {
    // Find the content item
    const content = libraryContent.find(item => item.id === contentId);
    if (!content) {
      showNotification('Content not found', 'error');
      return;
    }
    
    // Update content without stream URL
    const updatedContent = {
      ...content,
      stream_url: '',
      in_library: true
    };
    
    const response = await axios.post(`${API_BASE}/api/library`, updatedContent);
    
    if (response.data.success) {
      showNotification(`Stream URL deleted for "${content.title}"`, 'success');
      await loadLibrary();
    } else {
      showNotification('Failed to delete stream URL', 'error');
    }
  } catch (error) {
    console.error('Error deleting stream URL:', error);
    showNotification('Failed to delete stream URL', 'error');
  }
}