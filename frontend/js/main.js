// Authentication Manager Class
class AuthManager {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.user = JSON.parse(localStorage.getItem('user') || '{}');
    }

    isAuthenticated() {
        return !!this.token;
    }

    getAuthHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        };
    }

    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }

    async verifyToken() {
        if (!this.token) {
            this.logout();
            return false;
        }

        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/user/profile`, {
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                this.logout();
                return false;
            }

            return true;
        } catch (error) {
            console.error('Token verification failed:', error);
            this.logout();
            return false;
        }
    }
}

// Card Reader Class
class CardReader {
    constructor(jsonURL) {
        this.jsonURL = jsonURL;
        this.jsonData = [];
        this.capabilities = [];
        this.authManager = new AuthManager();
        this.userRatings = new Map(); // Store user's existing ratings
        this.filters = {
            sector: null,
            aiCapabilities: null,
            grandChallance: null,
            searchText: '',
            scoreSignificance: null,
            scoreComplexity: null,
            scoreReadiness: null,
        };
    }

    async init() {
        // Check authentication first
        if (!this.authManager.isAuthenticated()) {
            console.log('No authentication found, redirecting to login...');
            window.location.href = 'login.html';
            return;
        }

        try {
            // Verify token is still valid
            const isValid = await this.authManager.verifyToken();
            if (!isValid) {
                return;
            }

            // Display user info
            this.displayUserInfo();

            // Fetch data and load cards
            await this.fetchData();
            await this.loadUserRatings();
            this.loadCards();
        } catch (error) {
            console.error('Initialization error:', error);
            // If authentication fails, still try to load cards without user features
            console.log('Loading cards without authentication...');
            await this.fetchData();
            this.loadCards();
        }
    }

    displayUserInfo() {
        const user = this.authManager.user;
        if (user && user.firstName) {
            // Add user info to the page header
            const userInfoHtml = `
                <div class="user-info d-flex align-items-center justify-content-between mb-3 p-3 bg-light rounded">
                    <div>
                        <span class="welcome-text h5 mb-1">Welcome, ${user.firstName} ${user.lastName}</span>
                        <small class="text-muted d-block">${user.email}</small>
                        <small class="text-info d-block">${user.demographics?.profession || 'No profession specified'} | ${user.demographics?.background || 'No background specified'}</small>
                    </div>
                    <div>
                        <button class="btn btn-outline-info btn-sm me-2" onclick="cardReader.showProfile()">
                            <i class="fas fa-user"></i> Profile
                        </button>
                        <button class="btn btn-outline-secondary btn-sm me-2" onclick="cardReader.showProgress()">
                            <i class="fas fa-chart-bar"></i> Progress
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="cardReader.authManager.logout()">
                            <i class="fas fa-sign-out-alt"></i> Logout
                        </button>
                    </div>
                </div>
            `;
            
            // Insert at the top of your main container
            const mainContainer = document.querySelector('.container, .main-content, body > .container-fluid, main');
            if (mainContainer) {
                mainContainer.insertAdjacentHTML('afterbegin', userInfoHtml);
            } else {
                // Fallback: insert after body opening
                document.body.insertAdjacentHTML('afterbegin', userInfoHtml);
            }
        }
    }

    showProfile() {
        const user = this.authManager.user;
        const demographics = user.demographics || {};
        
        const profileModal = `
            <div class="modal fade" id="profileModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="fas fa-user me-2"></i>Your Profile</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <strong>Name:</strong> ${user.firstName} ${user.lastName}
                                </div>
                                <div class="col-md-6">
                                    <strong>Email:</strong> ${user.email}
                                </div>
                            </div>
                            <hr>
                            <h6><i class="fas fa-chart-pie me-2"></i>Demographics</h6>
                            <div class="row">
                                <div class="col-md-6 mb-2">
                                    <strong>Age Group:</strong> ${demographics.ageGroup || 'N/A'}
                                </div>
                                <div class="col-md-6 mb-2">
                                    <strong>Gender:</strong> ${demographics.gender || 'N/A'}
                                </div>
                                <div class="col-md-6 mb-2">
                                    <strong>Profession:</strong> ${demographics.profession || 'N/A'}
                                </div>
                                <div class="col-md-6 mb-2">
                                    <strong>Education:</strong> ${demographics.educationLevel || 'N/A'}
                                </div>
                                <div class="col-md-6 mb-2">
                                    <strong>Background:</strong> ${demographics.background || 'N/A'}
                                </div>
                                <div class="col-md-6 mb-2">
                                    <strong>Experience:</strong> ${demographics.experience || 'N/A'}
                                </div>
                                ${demographics.country ? `
                                <div class="col-md-6 mb-2">
                                    <strong>Country:</strong> ${demographics.country}
                                </div>
                                ` : ''}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('profileModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to page and show it
        document.body.insertAdjacentHTML('beforeend', profileModal);
        const modal = new bootstrap.Modal(document.getElementById('profileModal'));
        modal.show();
    }

    showProgress() {
        const totalCards = this.jsonData.length;
        const ratedCards = this.userRatings.size;
        const completionPercentage = totalCards > 0 ? Math.round((ratedCards / totalCards) * 100) : 0;
        
        // Calculate ratings by type
        const ratingStats = {
            significance: 0,
            complexity: 0,
            readiness: 0
        };
        
        this.userRatings.forEach(ratings => {
            Object.keys(ratingStats).forEach(type => {
                if (ratings[type]) ratingStats[type]++;
            });
        });

        const progressModal = `
            <div class="modal fade" id="progressModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="fas fa-chart-bar me-2"></i>Your Progress</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-4">
                                <h6>Overall Progress</h6>
                                <div class="progress mb-2" style="height: 20px;">
                                    <div class="progress-bar" role="progressbar" style="width: ${completionPercentage}%">
                                        ${completionPercentage}%
                                    </div>
                                </div>
                                <small class="text-muted">You have rated ${ratedCards} out of ${totalCards} cards</small>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-4 text-center">
                                    <div class="card bg-primary text-white">
                                        <div class="card-body">
                                            <h4>${ratingStats.significance}</h4>
                                            <small>Significance Ratings</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4 text-center">
                                    <div class="card bg-warning text-white">
                                        <div class="card-body">
                                            <h4>${ratingStats.complexity}</h4>
                                            <small>Complexity Ratings</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4 text-center">
                                    <div class="card bg-success text-white">
                                        <div class="card-body">
                                            <h4>${ratingStats.readiness}</h4>
                                            <small>Readiness Ratings</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('progressModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to page and show it
        document.body.insertAdjacentHTML('beforeend', progressModal);
        const modal = new bootstrap.Modal(document.getElementById('progressModal'));
        modal.show();
    }

    async fetchData() {
        try {
            console.log('Fetching data from:', this.jsonURL);
            const response = await fetch(this.jsonURL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.jsonData = data.challenges || data;
            console.log('Loaded', this.jsonData.length, 'cards');
            
            try {
                const capResponse = await fetch('data/capabilities.json');
                if (capResponse.ok) {
                    const capData = await capResponse.json();
                    this.capabilities = capData.capabilities || [];
                    console.log('Loaded', this.capabilities.length, 'capabilities');
                } else {
                    console.warn('Could not load capabilities.json');
                }
            } catch (capError) {
                console.error('Error fetching or parsing capabilities data:', capError);
            }
        } catch (error) {
            console.error('Error fetching or parsing JSON:', error);
        }
    }

    async loadUserRatings() {
        if (!this.authManager.isAuthenticated()) {
            console.log('Not authenticated, skipping user ratings load');
            return;
        }

        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/feedback`, {
                headers: this.authManager.getAuthHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.ratings) {
                    // Organize ratings by card name
                    data.ratings.forEach(rating => {
                        if (!this.userRatings.has(rating.cardName)) {
                            this.userRatings.set(rating.cardName, {});
                        }
                        this.userRatings.get(rating.cardName)[rating.ratingType.toLowerCase()] = rating.ratingValue;
                    });
                    console.log('Loaded user ratings for', this.userRatings.size, 'cards');
                }
            }
        } catch (error) {
            console.error('Error loading user ratings:', error);
        }
    }

    applyFilters() {
        let filteredData = [...this.jsonData];

        if (this.filters.sector && this.filters.sector.length > 0) {
            filteredData = filteredData.filter(item => {
                const itemSector = item.sector.toLowerCase();
                return this.filters.sector.some(sector => itemSector.includes(sector));
            });
        }

        if (this.filters.aiCapabilities && this.filters.aiCapabilities.length > 0) {
            filteredData = filteredData.filter(item =>
                item.capabilities && item.capabilities.some(cap =>
                    this.filters.aiCapabilities.includes(cap.toLowerCase())
                )
            );
        }

        if (this.filters.searchText) {
            const searchText = this.filters.searchText.toLowerCase();
            filteredData = filteredData.filter(item =>
                item.title.toLowerCase().includes(searchText) || 
                item.description.toLowerCase().includes(searchText)
            );
        }

        if (this.filters.scoreSignificance !== null) {
            filteredData = filteredData.filter(item =>
                item.significance !== this.filters.scoreSignificance
            );
        }

        if (this.filters.scoreComplexity !== null) {
            filteredData = filteredData.filter(item =>
                item.complexity !== this.filters.scoreComplexity
            );
        }

        if (this.filters.scoreReadiness !== null) {
            filteredData = filteredData.filter(item =>
                item.readiness !== this.filters.scoreReadiness
            );
        }

        return filteredData.length === this.jsonData.length && 
               Object.values(this.filters).every(v => v === null || v === '' || (Array.isArray(v) && v.length === 0)) 
               ? this.jsonData : filteredData;
    }

    loadCards() {
        try {
            const cardSection = $('.card-section');
            if (cardSection.length === 0) {
                console.error('Card section not found. Make sure you have an element with class "card-section"');
                return;
            }

            cardSection.empty();
            const filteredData = this.applyFilters();
            
            console.log('Loading', filteredData.length, 'cards after filtering');
            
            if (filteredData.length === 0) {
                cardSection.append('<div class="text-center p-4"><h5>No cards match your current filters</h5></div>');
                return;
            }

            filteredData.forEach(item => {
                const card = new Card(item, this.capabilities, this.userRatings.get(item.title) || {});
                cardSection.append(card.toHTML());
            });

            // Reinitialize tooltips after loading cards
            $('[data-bs-toggle="tooltip"]').tooltip();
            console.log('Cards loaded successfully');
        } catch (error) {
            console.error('Error loading cards:', error);
        }
    }
}

// Card Class
class Card {
    constructor(item, capabilities, userRatings = {}) {
        this.data = item;
        this.capabilitiesData = capabilities || [];
        this.userRatings = userRatings;
    }

    getColor() {
        const sector = this.data.sector.toLowerCase();
        if (sector.includes('energy') || sector.includes('utilities')) return 'energy';
        else if (sector.includes('natural environment')) return 'natural';
        else if (sector.includes('manufacturing')) return 'manufacturing';
        else if (sector.includes('transportation') || sector.includes('supply chain')) return 'transportation';
        else if (sector.includes('built environment')) return 'built';
        else if (sector.includes('health') || sector.includes('well-being')) return 'health';
        else if (sector.includes('government')) return 'government';
        else if (sector.includes('cross-cutting')) return 'cross';
        else return 'energy';
    }

    getCapabilityIcon(capabilityId) {
        if (!capabilityId) return '';
        const capability = this.capabilitiesData.find(cap => cap.id === capabilityId);
        const iconName = capability ? capability.icon : capabilityId;
        const fontAwesomeIcons = {
            'system_modelling': 'fa-solid fa-diagram-project',
            'data_integration': 'fa-solid fa-database',
            'predictive_analytics': 'fa-solid fa-chart-line',
            'anomaly_detection': 'fa-solid fa-triangle-exclamation',
            'decision_support': 'fa-solid fa-clipboard-check',
            'visual_spatial': 'fa-solid fa-map',
            'human_twin_interaction': 'fa-solid fa-user-gear',
            'twin_orchestration': 'fa-solid fa-cubes',
            'knowledge_representation': 'fa-solid fa-brain',
            'security_privacy': 'fa-solid fa-shield-halved',
            'realtime_monitoring': 'fa-solid fa-gauge-high',
            'vvuq': 'fa-solid fa-check-double',
            'optimisation': 'fa-solid fa-sliders'
        };
        return fontAwesomeIcons[capabilityId] || (this.getColor() + "/" + iconName + '.svg');
    }

    getImg() {
        const sector = this.data.sector.toLowerCase();
        if (sector.includes('energy') || sector.includes('utilities')) return 'Energy.svg';
        else if (sector.includes('natural environment')) return 'Natural_Environment.svg';
        else if (sector.includes('manufacturing')) return 'Manufacturing.svg';
        else if (sector.includes('transportation') || sector.includes('supply chain')) return 'Transportation.svg';
        else if (sector.includes('built environment')) return 'Built_Environment.svg';
        else if (sector.includes('health') || sector.includes('well-being')) return 'Health.svg';
        else if (sector.includes('government')) return 'Government.svg';
        else if (sector.includes('cross-cutting')) return 'Cross_Cutting.svg';
        else return 'Energy.svg';
    }

    hasCapability(index) {
        return this.data.capabilities && this.data.capabilities.length > index;
    }

    getCapabilityAtIndex(index) {
        return this.data.capabilities && this.data.capabilities.length > index ? this.data.capabilities[index] : null;
    }

    getCapabilityName(capabilityId) {
        if (!capabilityId) return '';
        const capability = this.capabilitiesData.find(cap => cap.id === capabilityId);
        return capability ? capability.name : capabilityId;
    }

    starRating(scoreType) {
        const currentRating = this.userRatings[scoreType.toLowerCase()] || 0;
        let stars = '';
        for (let i = 1; i <= 3; i++) {
            const isFilled = i <= currentRating;
            stars += `<img 
                src="images/icons/${isFilled ? 'fill-star.svg' : 'star.svg'}" 
                alt="${scoreType} star ${i}" 
                class="rating-star" 
                data-score="${scoreType}" 
                data-value="${i}"
                style="cursor: pointer;"
            />`;
        }
        return stars;
    }

    toHTML() {
        return `
  <div class="card fadeIn card-${this.getColor()}-text-bg" data-card-name="${this.data.title}">
        <div class="card-content">
          <div class="card-side card-${this.getColor()}-bg">
            <div class="control-system card-${this.getColor()}-bg">
              <div class="number">
                <h5 class="card-${this.getColor()}-text-bg">${this.data.number}</h5>
              </div>
              <span>${this.data.title}</span>
            </div>
            <div class="icon icon-1 card-${this.getColor()}-bg">
              <span data-bs-toggle="tooltip" data-bs-placement="right" title="${this.getCapabilityName(this.getCapabilityAtIndex(0))}">${this.getCapabilityIcon(this.getCapabilityAtIndex(0)).startsWith('fa-') 
                ? `<i class="${this.getCapabilityIcon(this.getCapabilityAtIndex(0))}"></i>` 
                : `<img src="images/icons/${this.getCapabilityIcon(this.getCapabilityAtIndex(0))}" />`}</span>
            </div>
            ${this.hasCapability(1) ? `
              <div class="icon icon-2 card-${this.getColor()}-bg">
              <span data-bs-toggle="tooltip" data-bs-placement="right" title="${this.getCapabilityName(this.getCapabilityAtIndex(1))}">${this.getCapabilityIcon(this.getCapabilityAtIndex(1)).startsWith('fa-') 
                ? `<i class="${this.getCapabilityIcon(this.getCapabilityAtIndex(1))}"></i>` 
                : `<img src="images/icons/${this.getCapabilityIcon(this.getCapabilityAtIndex(1))}" />`}</span>
            </div>` : ''}
            ${this.hasCapability(2) ? `
              <div class="icon icon-3 card-${this.getColor()}-bg">
              <span data-bs-toggle="tooltip" data-bs-placement="right" title="${this.getCapabilityName(this.getCapabilityAtIndex(2))}">${this.getCapabilityIcon(this.getCapabilityAtIndex(2)).startsWith('fa-') 
                ? `<i class="${this.getCapabilityIcon(this.getCapabilityAtIndex(2))}"></i>` 
                : `<img src="images/icons/${this.getCapabilityIcon(this.getCapabilityAtIndex(2))}" />`}</span>
            </div>` : ''}
          </div>
          <div class="card-content-img">
            <img src="images/${this.getImg()}" alt="" />
          </div>
          <div class="card-content-text card-${this.getColor()}-text-bg">
            <p>${this.data.description}</p>
            <div class="rating">
              <div class="rating-item card-${this.getColor()}-bg">
                <h6>Significance</h6>
                <div class="rating-icon">
                 ${this.starRating("Significance")}
                </div>
              </div>
              <div class="rating-item card-${this.getColor()}-bg">
                <h6>Complexity</h6>
                <div class="rating-icon">
                 ${this.starRating("Complexity")}
                </div>
              </div>
              <div class="rating-item card-${this.getColor()}-bg">
                <h6>Readiness</h6>
                <div class="rating-icon">
                 ${this.starRating("Readiness")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    }
}

// Global variable for easy access
let cardReader;

// Initialize when DOM is ready
$(document).ready(function() {
    console.log('DOM ready, initializing CardReader...');
    cardReader = new CardReader('data/data.json');
    cardReader.init().then(() => {
        setupFilters(cardReader);
        setupUIHandlers();
    }).catch(error => {
        console.error('CardReader initialization failed:', error);
    });
});

// Filter setup function
function setupFilters(cardReader) {
    $('#searchBox').on('input', function() {
        cardReader.filters.searchText = $(this).val();
        cardReader.loadCards();
    });

    $('.sector-filter').on('change', 'input[type="checkbox"]', function() {
        const selectedSectors = $('.sector-filter input:checked').map(function() { 
            return $(this).val(); 
        }).get();
        cardReader.filters.sector = selectedSectors.length > 0 ? selectedSectors : null;
        cardReader.loadCards();
    });

    $('.ai-capabilities-filter').on('change', 'input[type="checkbox"]', function() {
        const selectedAICapabilities = $('.ai-capabilities-filter input:checked').map(function() { 
            return $(this).val(); 
        }).get();
        cardReader.filters.aiCapabilities = selectedAICapabilities.length > 0 ? selectedAICapabilities : null;
        cardReader.loadCards();
    });

    $('.gc-filter').on('change', 'select', function() {
        cardReader.filters.grandChallance = $(this).val() == 'all' ? null : $(this).val();
        cardReader.loadCards();
    });

    $('.scores-filter').on('click', '.btn-star', function() {
        const value = $(this).data("star");
        const scoreType = $(this).closest('.score-group').find('.score-label').text().trim();
        const filterKey = `score${scoreType.charAt(0).toUpperCase() + scoreType.slice(1)}`;

        cardReader.filters[filterKey] = (cardReader.filters[filterKey] === value) ? null : value;
        
        $(this).closest('.d-flex').find('.btn-star').removeClass('score-selected');
        if (cardReader.filters[filterKey]) {
            $(this).addClass('score-selected');
        }

        cardReader.loadCards();
    });
}

// UI handlers setup
function setupUIHandlers() {
    // Toggle functionality
    $('#toggler').click(function() {
        $('#toggler').toggleClass("arrow-down");
        $('#toggler').toggleClass("arrow-up");
    });

    // Scroll to top functionality
    $(window).scroll(function() {
        if ($(this).scrollTop() > 100) {
            $('#scrollToTopBtn').fadeIn();
        } else {
            $('#scrollToTopBtn').fadeOut();
        }
    });

    $('#scrollToTopBtn').click(function() {
        $('html, body').animate({ scrollTop: 0 }, 'slow');
        return false;
    });

    $('#toggler').click(function() {
        if ($(this).hasClass("arrow-down")) {
            $('html, body').animate({ scrollTop: 0 }, 'slow');
            return false;
        }
    });

    // Initialize tooltips
    $(function() {
        $('[data-bs-toggle="tooltip"]').tooltip();
    });
}

// Rating click handler with authentication
$(document).on('click', '.rating-star', function(e) {
    const card = $(this).closest(".card");
    const cardName = card.attr("data-card-name");
    const scoreType = $(this).attr("data-score");
    const clickedValue = parseInt($(this).attr("data-value"));

    const allStars = $(this).parent().find(".rating-star");
    let currentValue = 0;
    allStars.each(function(i, star) {
        if (star.src.includes("fill-star.svg")) currentValue = i + 1;
    });

    const newValue = (clickedValue === currentValue && this.src.includes("fill-star.svg")) ? 0 : clickedValue;
    
    // Update visual feedback immediately
    allStars.each(function(i, star) {
        star.src = i < newValue ? "images/icons/fill-star.svg" : "images/icons/star.svg";
    });

    card.data(`${scoreType.toLowerCase()}`, newValue);

    // Update local storage of ratings
    if (!cardReader.userRatings.has(cardName)) {
        cardReader.userRatings.set(cardName, {});
    }
    cardReader.userRatings.get(cardName)[scoreType.toLowerCase()] = newValue;

    // Send update to backend with authentication (only if authenticated)
    if (cardReader && cardReader.authManager.isAuthenticated()) {
        fetch(`${CONFIG.API_BASE_URL}/feedback`, {
            method: 'PUT',
            headers: cardReader.authManager.getAuthHeaders(),
            body: JSON.stringify({
                cardName,
                ratingType: scoreType,
                ratingValue: newValue
            })
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                console.log(`${scoreType} updated to ${newValue} for ${cardName}`);
                // Optional: Show success feedback to user
                showRatingSuccess(cardName, scoreType, newValue);
            }
        })
        .catch(err => {
            console.error('Error updating rating:', err);
            // Revert visual feedback on error
            allStars.each(function(i, star) {
                const revertValue = currentValue;
                star.src = i < revertValue ? "images/icons/fill-star.svg" : "images/icons/star.svg";
            });
            // Revert local storage
            if (cardReader.userRatings.has(cardName)) {
                cardReader.userRatings.get(cardName)[scoreType.toLowerCase()] = currentValue;
            }
            // Optional: Show error feedback to user
            showRatingError();
        });
    } else {
        console.log('Rating saved locally (not authenticated)');
    }
});

// Utility Functions
function showRatingSuccess(cardName, scoreType, value) {
    // Create a small success indicator
    const indicator = $(`<div class="rating-success">✓ ${scoreType} rating saved</div>`);
    indicator.css({
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: '#28a745',
        color: 'white',
        padding: '8px 15px',
        borderRadius: '5px',
        zIndex: 9999,
        fontSize: '14px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        opacity: 0
    });
    
    $('body').append(indicator);
    indicator.animate({opacity: 1}, 200);
    setTimeout(() => indicator.animate({opacity: 0}, 200, () => indicator.remove()), 2000);
}

function showRatingError() {
    const indicator = $(`<div class="rating-error">❌ Failed to save rating</div>`);
    indicator.css({
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: '#dc3545',
        color: 'white',
        padding: '8px 15px',
        borderRadius: '5px',
        zIndex: 9999,
        fontSize: '14px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        opacity: 0
    });
    
    $('body').append(indicator);
    indicator.animate({opacity: 1}, 200);
    setTimeout(() => indicator.animate({opacity: 0}, 200, () => indicator.remove()), 3000);
}

// Clear all filters function
function clearAllFilters() {
    if (cardReader) {
        // Reset all filters
        cardReader.filters = {
            sector: null,
            aiCapabilities: null,
            grandChallance: null,
            searchText: '',
            scoreSignificance: null,
            scoreComplexity: null,
            scoreReadiness: null,
        };
        
        // Reset UI elements
        $('#searchBox').val('');
        $('.sector-filter input[type="checkbox"]').prop('checked', false);
        $('.ai-capabilities-filter input[type="checkbox"]').prop('checked', false);
        $('.gc-filter select').val('all');
        $('.scores-filter .btn-star').removeClass('score-selected');
        
        // Reload cards
        cardReader.loadCards();
    }
}

// Export data function (for admin use)
function exportUserData() {
    if (cardReader && cardReader.authManager.isAuthenticated()) {
        const userData = {
            user: cardReader.authManager.user,
            ratings: Array.from(cardReader.userRatings.entries()).map(([cardName, ratings]) => ({
                cardName,
                ...ratings
            })),
            exportDate: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(userData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `survey_data_${cardReader.authManager.user.firstName}_${cardReader.authManager.user.lastName}_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }
}

// Auto-save functionality (optional)
let autoSaveInterval;

function startAutoSave() {
    // Auto-save every 30 seconds if there are unsaved changes
    autoSaveInterval = setInterval(() => {
        if (cardReader && cardReader.authManager.isAuthenticated()) {
            // This is handled automatically by the rating click handler
            // but you could add additional auto-save logic here
            console.log('Auto-save check...');
        }
    }, 30000);
}

function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
    }
}

// Keyboard shortcuts
$(document).ready(function() {
    $(document).keydown(function(e) {
        // Ctrl+S or Cmd+S to save progress (though it's auto-saved)
        if ((e.ctrlKey || e.metaKey) && e.keyCode === 83) {
            e.preventDefault();
            if (cardReader) {
                cardReader.showProgress();
            }
        }
        
        // Ctrl+H or Cmd+H to show help
        if ((e.ctrlKey || e.metaKey) && e.keyCode === 72) {
            e.preventDefault();
            showHelp();
        }
        
        // Escape to close modals
        if (e.keyCode === 27) {
            $('.modal').modal('hide');
        }
    });
});

// Help function
function showHelp() {
    const helpModal = `
        <div class="modal fade" id="helpModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fas fa-question-circle me-2"></i>How to Use This Survey</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <h6>Rating System</h6>
                        <ul>
                            <li><strong>Significance:</strong> How important is this challenge?</li>
                            <li><strong>Complexity:</strong> How difficult is this challenge to solve?</li>
                            <li><strong>Readiness:</strong> How ready are current technologies to address this?</li>
                        </ul>
                        
                        <h6>Star Ratings</h6>
                        <ul>
                            <li>⭐ = Low</li>
                            <li>⭐⭐ = Medium</li>
                            <li>⭐⭐⭐ = High</li>
                        </ul>
                        
                        <h6>Features</h6>
                        <ul>
                            <li>Use filters to find specific types of challenges</li>
                            <li>Search by keywords in title or description</li>
                            <li>Your ratings are automatically saved</li>
                            <li>View your progress anytime</li>
                        </ul>
                        
                        <h6>Keyboard Shortcuts</h6>
                        <ul>
                            <li><kbd>Ctrl</kbd> + <kbd>S</kbd> - Show progress</li>
                            <li><kbd>Ctrl</kbd> + <kbd>H</kbd> - Show this help</li>
                            <li><kbd>Esc</kbd> - Close modals</li>
                        </ul>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Got it!</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('helpModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to page and show it
    document.body.insertAdjacentHTML('beforeend', helpModal);
    const modal = new bootstrap.Modal(document.getElementById('helpModal'));
    modal.show();
}

// Error handling for network issues
window.addEventListener('online', function() {
    console.log('Connection restored');
    if (cardReader) {
        // Optionally refresh data or show notification
        showNetworkStatus('Connection restored', 'success');
    }
});

window.addEventListener('offline', function() {
    console.log('Connection lost');
    showNetworkStatus('Connection lost - your ratings will be saved when connection is restored', 'warning');
});

function showNetworkStatus(message, type) {
    const statusClass = type === 'success' ? 'alert-success' : 'alert-warning';
    const statusIcon = type === 'success' ? '✓' : '⚠️';
    
    const statusAlert = $(`
        <div class="alert ${statusClass} alert-dismissible fade show" role="alert" style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999;">
            ${statusIcon} ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `);
    
    $('body').append(statusAlert);
    setTimeout(() => statusAlert.alert('close'), 5000);
}

// Initialize auto-save when page loads
$(document).ready(function() {
    startAutoSave();
});

// Cleanup when page unloads
$(window).on('beforeunload', function() {
    stopAutoSave();
});