import { db } from './firebase-config.js';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  writeBatch
} from 'firebase/firestore';

import { INITIAL_CATEGORIES, INITIAL_PEOPLE, INITIAL_MATTERS } from './initial-data.js';

// --- ORDEN DE CATEGORÍAS FIJO ---
const CATEGORY_ORDER = INITIAL_CATEGORIES.map(c => c.id);

// --- ESTADO DE LA APLICACIÓN ---
let state = {
  currentMode: 'view', // 'view' o 'edit'
  activeTab: 'people', // 'people' o 'matters'
  categories: [],
  people: [],
  matters: [],
  selectedPerson: null, // Persona abierta en el Side-Peek
  searchQuery: '',
  collapsedCategories: {}, // { categoryId: boolean } (true = colapsada)
};

// --- ELEMENTOS DEL DOM ---
const DOM = {
  sidebarToggle: document.getElementById('sidebar-toggle'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  appSidebar: document.getElementById('app-sidebar'),
  categoriesList: document.getElementById('categories-list'),
  btnAddCategory: document.getElementById('btn-add-category'),
  themeLight: document.getElementById('theme-light'),
  themeDark: document.getElementById('theme-dark'),
  layout1Col: document.getElementById('layout-1-col'),
  layout2Col: document.getElementById('layout-2-col'),
  
  mainContent: document.querySelector('.main-content'),
  mainAppTitle: document.getElementById('main-app-title'),
  
  modeView: document.getElementById('mode-view'),
  modeEdit: document.getElementById('mode-edit'),
  
  tabPeople: document.getElementById('tab-people'),
  tabMatters: document.getElementById('tab-matters'),
  
  peopleSection: document.getElementById('people-section'),
  mattersSection: document.getElementById('matters-section'),
  
  searchInput: document.getElementById('search-input'),
  btnAddPerson: document.getElementById('btn-add-person'),
  btnAddMatter: document.getElementById('btn-add-matter'),
  
  categoriesContainer: document.getElementById('categories-container'),
  peopleEmpty: document.getElementById('people-empty'),
  
  mattersList: document.getElementById('matters-list'),
  mattersEmpty: document.getElementById('matters-empty'),
  btnEmptyAddMatter: document.getElementById('btn-empty-add-matter'),
  
  // Side Peek
  sideOverlay: document.getElementById('side-overlay'),
  sidePeek: document.getElementById('side-peek'),
  btnClosePeek: document.getElementById('btn-close-peek'),
  peekPersonName: document.getElementById('peek-person-name'),
  editPersonName: document.getElementById('edit-person-name'),
  peekPersonCategory: document.getElementById('peek-person-category'),
  editPersonCategory: document.getElementById('edit-person-category'),
  prayersCount: document.getElementById('prayers-count'),
  newPrayerInput: document.getElementById('new-prayer-input'),
  btnAddPrayer: document.getElementById('btn-add-prayer'),
  activePrayersList: document.getElementById('active-prayers-list'),
  answeredPrayersContainer: document.getElementById('answered-prayers-container'),
  btnToggleAnswered: document.getElementById('btn-toggle-answered'),
  answeredCount: document.getElementById('answered-count'),
  answeredPrayersList: document.getElementById('answered-prayers-list'),
  btnDeletePerson: document.getElementById('btn-delete-person'),
  
  // Modal Categorías
  categoryModal: document.getElementById('category-modal'),
  modalCategoryTitle: document.getElementById('modal-category-title'),
  categoryNameInput: document.getElementById('category-name-input'),
  colorPickerGrid: document.getElementById('color-picker-grid'),
  btnDeleteCategory: document.getElementById('btn-delete-category'),
  btnCancelCategory: document.getElementById('btn-cancel-category'),
  btnSaveCategory: document.getElementById('btn-save-category'),
  btnCloseCategoryModal: document.getElementById('btn-close-category-modal'),
  
  // Modal Asuntos
  matterModal: document.getElementById('matter-modal'),
  modalMatterTitle: document.getElementById('modal-matter-title'),
  matterTitleInput: document.getElementById('matter-title-input'),
  matterDescInput: document.getElementById('matter-desc-input'),
  matterCatInput: document.getElementById('matter-cat-input'),
  btnDeleteMatter: document.getElementById('btn-delete-matter'),
  btnCancelMatter: document.getElementById('btn-cancel-matter'),
  btnSaveMatter: document.getElementById('btn-save-matter'),
  btnCloseMatterModal: document.getElementById('btn-close-matter-modal'),

  // Modal Personas (Nuevo)
  personModal: document.getElementById('person-modal'),
  modalPersonTitle: document.getElementById('modal-person-title'),
  personNameInput: document.getElementById('person-name-input'),
  personCatSelect: document.getElementById('person-cat-select'),
  personInitialPrayerInput: document.getElementById('person-initial-prayer-input'),
  btnCancelPerson: document.getElementById('btn-cancel-person'),
  btnSavePerson: document.getElementById('btn-save-person'),
  btnClosePersonModal: document.getElementById('btn-close-person-modal'),

  // Modal Confirmación (Nuevo)
  confirmModal: document.getElementById('confirm-modal'),
  confirmModalTitle: document.getElementById('confirm-modal-title'),
  confirmModalMessage: document.getElementById('confirm-modal-message'),
  btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
  btnConfirmOk: document.getElementById('btn-confirm-ok'),
};

// Variables para modales y drag scroll
let editingCategoryId = null;
let editingMatterId = null;
let activeConfirmCallback = null;
let dragScrollInterval = null;

// --- INICIALIZACIÓN ---
async function init() {
  setAppMode('view');
  setupEventListeners();
  initSettings();
  
  // Verificar si la base de datos está vacía para auto-importar
  const catsSnap = await getDocs(collection(db, 'categories'));
  if (catsSnap.empty) {
    console.log("Base de datos vacía. Precargando listas iniciales de forma automática...");
    await importInitialData();
  } else {
    loadRealtimeData();
  }
}

// --- CONFIGURACIÓN DE AJUSTES ---
function initSettings() {
  // 1. Tema Claro / Oscuro
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
    setTheme('dark');
  } else {
    setTheme('light');
  }

  // 2. Disposición de Columnas (Por defecto modo 1 columna ahora!)
  const savedLayout = localStorage.getItem('layout') || '1-col';
  setLayout(savedLayout);
}

function setTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
    localStorage.setItem('theme', 'dark');
    DOM.themeDark.classList.add('active');
    DOM.themeLight.classList.remove('active');
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
    localStorage.setItem('theme', 'light');
    DOM.themeLight.classList.add('active');
    DOM.themeDark.classList.remove('active');
  }
}

function setLayout(layout) {
  if (layout === '1-col') {
    document.body.classList.add('layout-1-col-active');
    document.body.classList.remove('layout-2-col-active');
    localStorage.setItem('layout', '1-col');
    DOM.layout1Col.classList.add('active');
    DOM.layout2Col.classList.remove('active');
  } else {
    document.body.classList.add('layout-2-col-active');
    document.body.classList.remove('layout-1-col-active');
    localStorage.setItem('layout', '2-col');
    DOM.layout2Col.classList.add('active');
    DOM.layout1Col.classList.remove('active');
  }
}

// --- SISTEMA DRAG SCROLL FLUIDO ---
function handleDragScroll(e) {
  const container = DOM.mainContent;
  if (!container) return;
  
  const rect = container.getBoundingClientRect();
  const topEdge = rect.top + 80;
  const bottomEdge = rect.bottom - 80;
  
  clearInterval(dragScrollInterval);
  
  if (e.clientY < topEdge) {
    const speed = Math.max(3, (topEdge - e.clientY) / 3);
    dragScrollInterval = setInterval(() => {
      container.scrollTop -= speed;
    }, 15);
  } else if (e.clientY > bottomEdge) {
    const speed = Math.max(3, (e.clientY - bottomEdge) / 3);
    dragScrollInterval = setInterval(() => {
      container.scrollTop += speed;
    }, 15);
  }
}

function stopDragScroll() {
  clearInterval(dragScrollInterval);
}

// --- VENTANA MODAL DE CONFIRMACIÓN PERSONALIZADA ---
function showConfirmModal(title, message, onOk) {
  DOM.confirmModalTitle.textContent = title;
  DOM.confirmModalMessage.textContent = message;
  activeConfirmCallback = onOk;
  DOM.confirmModal.classList.remove('hidden');
}

function closeConfirmModal() {
  DOM.confirmModal.classList.add('hidden');
  activeConfirmCallback = null;
}

// --- CONEXIÓN A FIRESTORE EN TIEMPO REAL ---
function loadRealtimeData() {
  // 1. Escuchar Categorías
  const categoriesQuery = query(collection(db, 'categories'));
  onSnapshot(categoriesQuery, (snapshot) => {
    state.categories = [];
    snapshot.forEach((doc) => {
      state.categories.push({ id: doc.id, ...doc.data() });
    });
    
    state.categories.sort((a, b) => {
      const indexA = CATEGORY_ORDER.indexOf(a.id);
      const indexB = CATEGORY_ORDER.indexOf(b.id);
      
      if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      
      return indexA - indexB;
    });
    
    renderCategoriesSidebar();
    updateCategorySelectOptions();
    renderPeople();
  });

  // 2. Escuchar Personas
  const peopleQuery = query(collection(db, 'people'));
  onSnapshot(peopleQuery, (snapshot) => {
    state.people = [];
    snapshot.forEach((doc) => {
      state.people.push({ id: doc.id, ...doc.data() });
    });
    
    state.people.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : 0;
      const orderB = b.order !== undefined ? b.order : 0;
      
      if (orderA === orderB) {
        return a.name.localeCompare(b.name);
      }
      return orderA - orderB;
    });
    
    renderPeople();
    
    if (state.selectedPerson) {
      const updatedPerson = state.people.find(p => p.id === state.selectedPerson.id);
      if (updatedPerson) {
        state.selectedPerson = updatedPerson;
        updateSidePeekUI();
      } else {
        closeSidePeek();
      }
    }
  });

  // 3. Escuchar Asuntos
  const mattersQuery = query(collection(db, 'matters'), orderBy('createdAt', 'desc'));
  onSnapshot(mattersQuery, (snapshot) => {
    state.matters = [];
    snapshot.forEach((doc) => {
      state.matters.push({ id: doc.id, ...doc.data() });
    });
    renderMatters();
  });
}

// --- LOGICA DE IMPORTACIÓN ---
async function importInitialData() {
  try {
    const batch = writeBatch(db);
    
    INITIAL_CATEGORIES.forEach((cat) => {
      const catRef = doc(collection(db, 'categories'), cat.id);
      batch.set(catRef, {
        name: cat.name,
        color: cat.color
      });
    });
    
    INITIAL_PEOPLE.forEach((person, index) => {
      const personRef = doc(collection(db, 'people'));
      batch.set(personRef, {
        name: person.name,
        category: person.category,
        prayers: person.prayers,
        order: index,
        createdAt: new Date()
      });
    });
    
    INITIAL_MATTERS.forEach((matter) => {
      const matterRef = doc(collection(db, 'matters'));
      batch.set(matterRef, {
        title: matter.title,
        description: matter.description,
        category: matter.category,
        status: matter.status,
        createdAt: new Date()
      });
    });
    
    await batch.commit();
    loadRealtimeData();
  } catch (error) {
    console.error("Error importando datos iniciales:", error);
  }
}

// --- RENDERIZADORES DE INTERFAZ ---

function renderCategoriesSidebar() {
  DOM.categoriesList.innerHTML = '';
  
  state.categories.forEach((cat) => {
    const li = document.createElement('li');
    
    li.innerHTML = `
      <button class="menu-item" data-id="${cat.id}">
        <div class="menu-item-left">
          <span class="menu-color-indicator" style="background-color: var(--tag-${cat.color}-txt)"></span>
          <span>${cat.name}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <button class="menu-item-edit edit-element hidden" data-id="${cat.id}" title="Editar categoría">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path></svg>
          </button>
        </div>
      </button>
    `;
    
    const btn = li.querySelector('.menu-item');
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.menu-item-edit')) {
        e.stopPropagation();
        openCategoryModal(cat.id);
        return;
      }
      
      scrollToCategorySection(cat.id);
      closeMobileSidebar();
    });
    
    DOM.categoriesList.appendChild(li);
  });
  
  applyModeVisibility();
}

function scrollToCategorySection(categoryId) {
  setActiveTab('people');
  
  const section = document.getElementById(`category-sec-${categoryId}`);
  if (section) {
    if (state.collapsedCategories[categoryId]) {
      state.collapsedCategories[categoryId] = false;
      section.classList.remove('collapsed');
      const arrow = section.querySelector('.category-arrow svg');
      if (arrow) arrow.style.transform = '';
    }
    
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderPeople() {
  DOM.categoriesContainer.innerHTML = '';
  
  if (state.categories.length === 0) {
    DOM.peopleEmpty.classList.remove('hidden');
    DOM.categoriesContainer.classList.add('hidden');
    return;
  }
  
  DOM.peopleEmpty.classList.add('hidden');
  DOM.categoriesContainer.classList.remove('hidden');
  
  let totalRendered = 0;
  
  state.categories.forEach((cat) => {
    const catPeople = state.people.filter(person => 
      person.category === cat.id &&
      person.name.toLowerCase().includes(state.searchQuery.toLowerCase())
    );
    
    if (state.searchQuery && catPeople.length === 0) return;
    
    totalRendered += catPeople.length;
    
    const section = document.createElement('section');
    const isCollapsed = !!state.collapsedCategories[cat.id];
    section.id = `category-sec-${cat.id}`;
    section.className = `category-section ${isCollapsed ? 'collapsed' : ''}`;
    
    section.innerHTML = `
      <button class="category-header-toggle" data-id="${cat.id}">
        <span class="category-arrow">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="transform: ${isCollapsed ? 'rotate(-90deg)' : 'none'}; transition: transform var(--t-fast);"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </span>
        <span class="badge ${cat.color}">${cat.name}</span>
        <span class="menu-item-count" style="margin-left: 4px;">${catPeople.length}</span>
      </button>
      
      <div class="cards-grid" data-category-id="${cat.id}">
        <!-- Tarjetas de personas -->
      </div>
    `;
    
    const toggleBtn = section.querySelector('.category-header-toggle');
    toggleBtn.addEventListener('click', () => {
      const currentlyCollapsed = !state.collapsedCategories[cat.id];
      state.collapsedCategories[cat.id] = currentlyCollapsed;
      
      if (currentlyCollapsed) {
        section.classList.add('collapsed');
        section.querySelector('.category-arrow svg').style.transform = 'rotate(-90deg)';
      } else {
        section.classList.remove('collapsed');
        section.querySelector('.category-arrow svg').style.transform = 'none';
      }
    });
    
    const grid = section.querySelector('.cards-grid');
    
    // DRAG OVER GRID
    grid.addEventListener('dragover', (e) => {
      if (state.currentMode !== 'edit') return;
      e.preventDefault();
      handleDragScroll(e);
      grid.classList.add('drag-over');
    });
    
    grid.addEventListener('dragleave', () => {
      grid.classList.remove('drag-over');
    });
    
    grid.addEventListener('drop', async (e) => {
      if (state.currentMode !== 'edit') return;
      e.preventDefault();
      grid.classList.remove('drag-over');
      stopDragScroll();
      
      if (e.target.closest('.person-card')) return;
      
      const draggedId = e.dataTransfer.getData('text/plain');
      const draggedPerson = state.people.find(p => p.id === draggedId);
      if (!draggedPerson) return;
      
      const targetCatId = cat.id;
      
      if (draggedPerson.category !== targetCatId) {
        const targetCatPeople = state.people.filter(p => p.category === targetCatId);
        const newOrder = targetCatPeople.length;
        
        try {
          await updateDoc(doc(db, 'people', draggedId), {
            category: targetCatId,
            order: newOrder
          });
        } catch (err) {
          console.error("Error al mover persona:", err);
        }
      }
    });
    
    if (catPeople.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 12px; font-size: 13px; color: var(--text-secondary);">No hay nadie en esta categoría.</div>`;
    } else {
      catPeople.forEach((person) => {
        const card = document.createElement('article');
        card.className = 'person-card';
        card.setAttribute('data-id', person.id);
        
        if (state.currentMode === 'edit') {
          card.setAttribute('draggable', 'true');
        }
        
        const activePrayers = person.prayers ? person.prayers.filter(p => p.status === 'active') : [];
        
        let prayersHtml = '';
        if (activePrayers.length > 0) {
          prayersHtml = `<div class="person-card-prayers">`;
          activePrayers.forEach((p) => {
            prayersHtml += `<span class="small-prayer-bullet" title="${p.text}">• ${p.text}</span>`;
          });
          prayersHtml += `</div>`;
        }
        
        card.innerHTML = `
          <div class="person-card-header">
            <h3 class="person-name">${person.name}</h3>
          </div>
          ${prayersHtml}
          <div class="card-actions edit-element hidden">
            <button class="btn-card-action delete" data-id="${person.id}" title="Eliminar persona">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
            </button>
          </div>
        `;
        
        // DRAG & DROP TARJETA
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', person.id);
          card.classList.add('dragging');
        });
        
        card.addEventListener('dragend', () => {
          card.classList.remove('dragging');
          stopDragScroll();
          document.querySelectorAll('.person-card').forEach(c => c.classList.remove('drag-over-before'));
          document.querySelectorAll('.cards-grid').forEach(g => g.classList.remove('drag-over'));
        });
        
        card.addEventListener('dragover', (e) => {
          if (state.currentMode !== 'edit') return;
          e.preventDefault();
          handleDragScroll(e);
          
          const draggingCard = document.querySelector('.person-card.dragging');
          if (draggingCard && draggingCard !== card) {
            card.classList.add('drag-over-before');
          }
        });
        
        card.addEventListener('dragleave', () => {
          card.classList.remove('drag-over-before');
        });
        
        card.addEventListener('drop', async (e) => {
          if (state.currentMode !== 'edit') return;
          e.preventDefault();
          card.classList.remove('drag-over-before');
          stopDragScroll();
          
          const draggedId = e.dataTransfer.getData('text/plain');
          const targetId = person.id;
          
          if (draggedId === targetId) return;
          
          const draggedPerson = state.people.find(p => p.id === draggedId);
          const targetPerson = state.people.find(p => p.id === targetId);
          if (!draggedPerson || !targetPerson) return;
          
          const targetCatId = targetPerson.category;
          const targetCatPeople = state.people.filter(p => p.category === targetCatId && p.id !== draggedId);
          const targetIdx = targetCatPeople.findIndex(p => p.id === targetId);
          
          targetCatPeople.splice(targetIdx, 0, draggedPerson);
          
          try {
            const batch = writeBatch(db);
            targetCatPeople.forEach((p, idx) => {
              const personRef = doc(db, 'people', p.id);
              batch.update(personRef, {
                order: idx,
                category: targetCatId
              });
            });
            await batch.commit();
          } catch (err) {
            console.error("Error reordenando lista:", err);
          }
        });
        
        card.addEventListener('click', (e) => {
          if (e.target.closest('.btn-card-action.delete')) {
            e.stopPropagation();
            deletePerson(person.id);
            return;
          }
          openSidePeek(person);
        });
        
        grid.appendChild(card);
      });
    }
    
    DOM.categoriesContainer.appendChild(section);
  });
  
  if (state.searchQuery && totalRendered === 0) {
    DOM.categoriesContainer.innerHTML = `<div class="empty-state"><p>No se encontraron oraciones para "${state.searchQuery}"</p></div>`;
  }
  
  applyModeVisibility();
}

function renderMatters() {
  DOM.mattersList.innerHTML = '';
  
  const filteredMatters = state.matters.filter(matter => 
    matter.title.toLowerCase().includes(state.searchQuery.toLowerCase()) || 
    (matter.description && matter.description.toLowerCase().includes(state.searchQuery.toLowerCase()))
  );
  
  if (filteredMatters.length === 0) {
    DOM.mattersEmpty.classList.remove('hidden');
    DOM.mattersList.classList.add('hidden');
    return;
  }
  
  DOM.mattersEmpty.classList.add('hidden');
  DOM.mattersList.classList.remove('hidden');
  
  filteredMatters.forEach((matter) => {
    const item = document.createElement('div');
    const isAnswered = matter.status === 'answered';
    item.className = `matter-item ${isAnswered ? 'answered' : ''}`;
    
    item.innerHTML = `
      <div class="matter-checkbox-wrapper">
        <input type="checkbox" class="custom-checkbox" ${isAnswered ? 'checked' : ''} data-id="${matter.id}">
      </div>
      <div class="matter-body">
        <div class="matter-header">
          <span class="matter-title">${matter.title}</span>
          ${matter.category ? `<span class="badge grey">${matter.category}</span>` : ''}
        </div>
        ${matter.description ? `<p class="matter-desc">${matter.description}</p>` : ''}
      </div>
      <div class="matter-actions edit-element hidden">
        <button class="btn-card-action edit" data-id="${matter.id}" title="Editar asunto">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path></svg>
        </button>
        <button class="btn-card-action delete" data-id="${matter.id}" title="Eliminar asunto">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
        </button>
      </div>
    `;
    
    const checkbox = item.querySelector('.custom-checkbox');
    checkbox.addEventListener('change', (e) => {
      toggleMatterStatus(matter.id, e.target.checked);
    });
    
    const btnEdit = item.querySelector('.btn-card-action.edit');
    if (btnEdit) {
      btnEdit.addEventListener('click', () => openMatterModal(matter));
    }
    const btnDelete = item.querySelector('.btn-card-action.delete');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => deleteMatter(matter.id));
    }
    
    DOM.mattersList.appendChild(item);
  });
  
  applyModeVisibility();
}

// --- GESTIÓN DE SIDE-PEEK ---

function openSidePeek(person) {
  state.selectedPerson = person;
  
  DOM.peekPersonName.textContent = person.name;
  DOM.editPersonName.value = person.name;
  DOM.editPersonCategory.value = person.category;
  
  const cat = state.categories.find(c => c.id === person.category);
  if (cat) {
    DOM.peekPersonCategory.innerHTML = `<span class="badge ${cat.color}">${cat.name}</span>`;
  } else {
    DOM.peekPersonCategory.innerHTML = `<span class="badge grey">Sin categoría</span>`;
  }
  
  updateSidePeekUI();
  
  DOM.sideOverlay.classList.add('active');
  DOM.sidePeek.classList.add('active');
}

function closeSidePeek() {
  state.selectedPerson = null;
  DOM.sideOverlay.classList.remove('active');
  DOM.sidePeek.classList.remove('active');
  DOM.newPrayerInput.value = '';
}

function updateSidePeekUI() {
  if (!state.selectedPerson) return;
  
  const prayers = state.selectedPerson.prayers || [];
  const activePrayers = prayers.filter(p => p.status === 'active');
  const answeredPrayers = prayers.filter(p => p.status === 'answered');
  
  DOM.prayersCount.textContent = `${activePrayers.length} ${activePrayers.length === 1 ? 'activa' : 'activas'}`;
  DOM.answeredCount.textContent = answeredPrayers.length;
  
  if (answeredPrayers.length > 0) {
    DOM.answeredPrayersContainer.classList.remove('hidden');
  } else {
    DOM.answeredPrayersContainer.classList.add('hidden');
  }
  
  // Renderizar Activas
  DOM.activePrayersList.innerHTML = '';
  if (activePrayers.length === 0) {
    DOM.activePrayersList.innerHTML = `<li style="padding: 10px 12px; font-size:13px; color:var(--text-secondary); text-align:center;">No tiene peticiones activas.</li>`;
  } else {
    activePrayers.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'prayer-item';
      li.innerHTML = `
        <input type="checkbox" class="custom-checkbox" data-prayer-id="${p.id}">
        <span class="prayer-text">${p.text}</span>
        <button class="btn-icon btn-delete-prayer edit-element hidden" data-prayer-id="${p.id}" title="Eliminar petición">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
        </button>
      `;
      
      li.querySelector('input').addEventListener('change', () => {
        togglePrayerStatus(state.selectedPerson.id, p.id, true);
      });
      
      const btnDel = li.querySelector('.btn-delete-prayer');
      btnDel.addEventListener('click', () => {
        deletePrayer(state.selectedPerson.id, p.id);
      });
      
      DOM.activePrayersList.appendChild(li);
    });
  }
  
  // Renderizar Respondidas
  DOM.answeredPrayersList.innerHTML = '';
  answeredPrayers.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'prayer-item answered';
    li.innerHTML = `
      <input type="checkbox" class="custom-checkbox" checked data-prayer-id="${p.id}">
      <span class="prayer-text">${p.text}</span>
      <button class="btn-icon btn-delete-prayer edit-element hidden" data-prayer-id="${p.id}" title="Eliminar petición">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
      </button>
    `;
    
    li.querySelector('input').addEventListener('change', () => {
      togglePrayerStatus(state.selectedPerson.id, p.id, false);
    });
    
    const btnDel = li.querySelector('.btn-delete-prayer');
    btnDel.addEventListener('click', () => {
      deletePrayer(state.selectedPerson.id, p.id);
    });
    
    DOM.answeredPrayersList.appendChild(li);
  });
  
  applyModeVisibility();
}

function updateCategorySelectOptions() {
  DOM.editPersonCategory.innerHTML = '';
  state.categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    DOM.editPersonCategory.appendChild(opt);
  });
}

// --- ACCIONES DE FIRESTORE ---

async function toggleMatterStatus(id, checked) {
  try {
    await updateDoc(doc(db, 'matters', id), {
      status: checked ? 'answered' : 'active'
    });
  } catch (error) {
    console.error("Error actualizando estado del asunto:", error);
  }
}

async function togglePrayerStatus(personId, prayerId, makeAnswered) {
  if (!state.selectedPerson) return;
  
  const prayers = [...(state.selectedPerson.prayers || [])];
  const idx = prayers.findIndex(p => p.id === prayerId);
  if (idx !== -1) {
    prayers[idx].status = makeAnswered ? 'answered' : 'active';
    try {
      await updateDoc(doc(db, 'people', personId), { prayers });
    } catch (error) {
      console.error("Error actualizando petición:", error);
    }
  }
}

async function addNewPrayer() {
  const text = DOM.newPrayerInput.value.trim();
  if (!text || !state.selectedPerson) return;
  
  const prayers = [...(state.selectedPerson.prayers || [])];
  prayers.push({
    id: Date.now().toString(),
    text,
    status: 'active',
    createdAt: new Date()
  });
  
  try {
    await updateDoc(doc(db, 'people', state.selectedPerson.id), { prayers });
    DOM.newPrayerInput.value = '';
    DOM.newPrayerInput.focus();
  } catch (error) {
    console.error("Error añadiendo petición:", error);
  }
}

async function deletePrayer(personId, prayerId) {
  if (!state.selectedPerson) return;
  
  const prayers = (state.selectedPerson.prayers || []).filter(p => p.id !== prayerId);
  
  try {
    await updateDoc(doc(db, 'people', personId), { prayers });
  } catch (error) {
    console.error("Error eliminando petición:", error);
  }
}

// --- NUEVO SISTEMA MODAL DE AGREGAR PERSONA ---
function openPersonModal() {
  DOM.personNameInput.value = '';
  DOM.personInitialPrayerInput.value = '';
  
  DOM.personCatSelect.innerHTML = '';
  state.categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    DOM.personCatSelect.appendChild(opt);
  });
  
  DOM.personModal.classList.remove('hidden');
  DOM.personNameInput.focus();
}

function closePersonModal() {
  DOM.personModal.classList.add('hidden');
}

async function saveNewPerson() {
  const name = DOM.personNameInput.value.trim();
  const category = DOM.personCatSelect.value;
  const initialPrayer = DOM.personInitialPrayerInput.value.trim();
  
  if (!name) return;
  
  const currentMembers = state.people.filter(p => p.category === category);
  const nextOrderIndex = currentMembers.length;
  
  try {
    const prayers = [];
    if (initialPrayer) {
      prayers.push({
        id: Date.now().toString(),
        text: initialPrayer,
        status: 'active',
        createdAt: new Date()
      });
    }
    
    const docRef = await addDoc(collection(db, 'people'), {
      name,
      category,
      prayers,
      order: nextOrderIndex,
      createdAt: new Date()
    });
    
    closePersonModal();
    
    const newPerson = {
      id: docRef.id,
      name,
      category,
      prayers
    };
    openSidePeek(newPerson);
  } catch (err) {
    console.error("Error al crear persona:", err);
  }
}

async function savePersonChanges() {
  if (!state.selectedPerson) return;
  
  const newName = DOM.editPersonName.value.trim();
  const newCat = DOM.editPersonCategory.value;
  
  if (!newName) return;
  
  try {
    const updates = {
      name: newName
    };
    
    if (newCat !== state.selectedPerson.category) {
      const targetCatPeople = state.people.filter(p => p.category === newCat);
      updates.category = newCat;
      updates.order = targetCatPeople.length;
    }
    
    await updateDoc(doc(db, 'people', state.selectedPerson.id), updates);
  } catch (error) {
    console.error("Error guardando cambios del contacto:", error);
  }
}

function deletePerson(id) {
  const person = state.people.find(p => p.id === id);
  const name = person ? person.name : 'esta persona';
  
  showConfirmModal(
    "Eliminar Persona",
    `¿Seguro que deseas eliminar a ${name} de tus listas de oración? Esta acción no se puede deshacer.`,
    async () => {
      try {
        await deleteDoc(doc(db, 'people', id));
        if (state.selectedPerson && state.selectedPerson.id === id) {
          closeSidePeek();
        }
      } catch (error) {
        console.error("Error eliminando persona:", error);
      }
    }
  );
}

async function saveCategory() {
  const name = DOM.categoryNameInput.value.trim();
  const selectedDot = DOM.colorPickerGrid.querySelector('.color-dot.active');
  const color = selectedDot ? selectedDot.getAttribute('data-color') : 'pink';
  
  if (!name) return;
  
  try {
    if (editingCategoryId) {
      await updateDoc(doc(db, 'categories', editingCategoryId), { name, color });
    } else {
      await addDoc(collection(db, 'categories'), { name, color });
    }
    closeCategoryModal();
  } catch (error) {
    console.error("Error guardando categoría:", error);
  }
}

function deleteCategory() {
  if (!editingCategoryId) return;
  const cat = state.categories.find(c => c.id === editingCategoryId);
  const name = cat ? cat.name : 'esta categoría';
  
  showConfirmModal(
    "Eliminar Categoría",
    `¿Seguro que quieres eliminar la categoría "${name}"? Las personas asignadas seguirán existiendo sin categoría.`,
    async () => {
      try {
        const q = query(collection(db, 'people'), where('category', '==', editingCategoryId));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach((doc) => {
          batch.update(doc.ref, { category: 'sin-categoria' });
        });
        await batch.commit();
        
        await deleteDoc(doc(db, 'categories', editingCategoryId));
        closeCategoryModal();
      } catch (error) {
        console.error("Error eliminando categoría:", error);
      }
    }
  );
}

async function saveMatter() {
  const title = DOM.matterTitleInput.value.trim();
  const description = DOM.matterDescInput.value.trim();
  const category = DOM.matterCatInput.value.trim() || 'General';
  
  if (!title) return;
  
  try {
    if (editingMatterId) {
      await updateDoc(doc(db, 'matters', editingMatterId), {
        title,
        description,
        category
      });
    } else {
      await addDoc(collection(db, 'matters'), {
        title,
        description,
        category,
        status: 'active',
        createdAt: new Date()
      });
    }
    closeMatterModal();
  } catch (error) {
    console.error("Error guardando asunto:", error);
  }
}

function deleteMatter(id) {
  const matter = state.matters.find(m => m.id === id);
  const title = matter ? matter.title : 'este asunto';
  
  showConfirmModal(
    "Eliminar Asunto",
    `¿Seguro que quieres eliminar el asunto "${title}"?`,
    async () => {
      try {
        await deleteDoc(doc(db, 'matters', id));
        closeMatterModal();
      } catch (error) {
        console.error("Error eliminando asunto:", error);
      }
    }
  );
}

// --- MODALES ---

function openCategoryModal(catId = null) {
  editingCategoryId = catId;
  
  if (catId) {
    DOM.modalCategoryTitle.textContent = "Editar Categoría";
    DOM.btnDeleteCategory.classList.remove('hidden');
    
    const cat = state.categories.find(c => c.id === catId);
    if (cat) {
      DOM.categoryNameInput.value = cat.name;
      DOM.colorPickerGrid.querySelectorAll('.color-dot').forEach((dot) => {
        if (dot.getAttribute('data-color') === cat.color) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }
  } else {
    DOM.modalCategoryTitle.textContent = "Nueva Categoría";
    DOM.btnDeleteCategory.classList.add('hidden');
    DOM.categoryNameInput.value = '';
    DOM.colorPickerGrid.querySelectorAll('.color-dot').forEach((dot, idx) => {
      if (idx === 0) dot.classList.add('active');
      else dot.classList.remove('active');
    });
  }
  
  DOM.categoryModal.classList.remove('hidden');
  DOM.categoryNameInput.focus();
}

function closeCategoryModal() {
  DOM.categoryModal.classList.add('hidden');
  editingCategoryId = null;
}

function openMatterModal(matter = null) {
  if (matter) {
    editingMatterId = matter.id;
    DOM.modalMatterTitle.textContent = "Editar Asunto";
    DOM.btnDeleteMatter.classList.remove('hidden');
    DOM.matterTitleInput.value = matter.title;
    DOM.matterDescInput.value = matter.description || '';
    DOM.matterCatInput.value = matter.category || '';
  } else {
    editingMatterId = null;
    DOM.modalMatterTitle.textContent = "Nuevo Asunto";
    DOM.btnDeleteMatter.classList.add('hidden');
    DOM.matterTitleInput.value = '';
    DOM.matterDescInput.value = '';
    DOM.matterCatInput.value = 'General';
  }
  
  DOM.matterModal.classList.remove('hidden');
  DOM.matterTitleInput.focus();
}

function closeMatterModal() {
  DOM.matterModal.classList.add('hidden');
  editingMatterId = null;
}

// --- NAVEGACIÓN Y CONFIGURACIÓN ---

function setActiveTab(tab) {
  state.activeTab = tab;
  
  if (tab === 'people') {
    DOM.tabPeople.classList.add('active');
    DOM.tabMatters.classList.remove('active');
    DOM.peopleSection.classList.add('active');
    DOM.mattersSection.classList.remove('active');
    DOM.btnAddPerson.classList.remove('hidden');
    DOM.btnAddMatter.classList.add('hidden');
    DOM.mainAppTitle.textContent = "Listas";
  } else {
    DOM.tabPeople.classList.remove('active');
    DOM.tabMatters.classList.add('active');
    DOM.peopleSection.classList.remove('active');
    DOM.mattersSection.classList.add('active');
    DOM.btnAddPerson.classList.add('hidden');
    DOM.btnAddMatter.classList.remove('hidden');
    DOM.mainAppTitle.textContent = "Asuntos Pendientes";
  }
  
  DOM.searchInput.value = '';
  state.searchQuery = '';
}

function setAppMode(mode) {
  state.currentMode = mode;
  
  if (mode === 'view') {
    DOM.modeView.classList.add('active');
    DOM.modeEdit.classList.remove('active');
    document.body.className = 'mode-view-active';
  } else {
    DOM.modeView.classList.remove('active');
    DOM.modeEdit.classList.add('active');
    document.body.className = 'mode-edit-active';
  }
  
  renderPeople();
  
  if (state.selectedPerson) {
    updateSidePeekUI();
  }
}

function applyModeVisibility() {
  const isView = state.currentMode === 'view';
  
  document.querySelectorAll('.edit-element').forEach((el) => {
    if (isView) el.classList.add('hidden');
    else el.classList.remove('hidden');
  });
  
  document.querySelectorAll('.view-element').forEach((el) => {
    if (isView) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });
}

function closeMobileSidebar() {
  DOM.appSidebar.classList.remove('active');
  DOM.sidebarBackdrop.classList.remove('active');
}

// --- MANEJADORES DE EVENTOS ---
function setupEventListeners() {
  DOM.sidebarToggle.addEventListener('click', () => {
    DOM.appSidebar.classList.add('active');
    DOM.sidebarBackdrop.classList.add('active');
  });
  
  DOM.sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  
  // Ajustes
  DOM.themeLight.addEventListener('click', () => setTheme('light'));
  DOM.themeDark.addEventListener('click', () => setTheme('dark'));
  DOM.layout1Col.addEventListener('click', () => setLayout('1-col'));
  DOM.layout2Col.addEventListener('click', () => setLayout('2-col'));
  
  // Tabs sidebar
  DOM.tabPeople.addEventListener('click', () => {
    setActiveTab('people');
    closeMobileSidebar();
  });
  DOM.tabMatters.addEventListener('click', () => {
    setActiveTab('matters');
    closeMobileSidebar();
  });
  
  DOM.modeView.addEventListener('click', () => setAppMode('view'));
  DOM.modeEdit.addEventListener('click', () => setAppMode('edit'));
  
  DOM.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (state.activeTab === 'people') renderPeople();
    else renderMatters();
  });
  
  // Añadir personas/asuntos
  DOM.btnAddPerson.addEventListener('click', openPersonModal);
  DOM.btnAddMatter.addEventListener('click', () => openMatterModal());
  DOM.btnEmptyAddMatter.addEventListener('click', () => openMatterModal());
  
  // Modals Categorías
  DOM.btnAddCategory.addEventListener('click', () => openCategoryModal());
  DOM.btnCancelCategory.addEventListener('click', closeCategoryModal);
  DOM.btnCloseCategoryModal.addEventListener('click', closeCategoryModal);
  DOM.btnSaveCategory.addEventListener('click', saveCategory);
  DOM.btnDeleteCategory.addEventListener('click', deleteCategory);
  
  // Modals Asuntos
  DOM.btnCancelMatter.addEventListener('click', closeMatterModal);
  DOM.btnCloseMatterModal.addEventListener('click', closeMatterModal);
  DOM.btnSaveMatter.addEventListener('click', saveMatter);
  DOM.btnDeleteMatter.addEventListener('click', () => deleteMatter(editingMatterId));

  // Modals Personas (Nuevo)
  DOM.btnClosePersonModal.addEventListener('click', closePersonModal);
  DOM.btnCancelPerson.addEventListener('click', closePersonModal);
  DOM.btnSavePerson.addEventListener('click', saveNewPerson);
  DOM.personNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveNewPerson();
  });
  DOM.personInitialPrayerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveNewPerson();
  });

  // Modal Confirmación (Nuevo)
  DOM.btnConfirmCancel.addEventListener('click', closeConfirmModal);
  DOM.btnConfirmOk.addEventListener('click', () => {
    if (activeConfirmCallback) activeConfirmCallback();
    closeConfirmModal();
  });
  
  // Color Picker
  DOM.colorPickerGrid.addEventListener('click', (e) => {
    const dot = e.target.closest('.color-dot');
    if (dot) {
      DOM.colorPickerGrid.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    }
  });
  
  // Side Peek
  DOM.btnClosePeek.addEventListener('click', closeSidePeek);
  DOM.sideOverlay.addEventListener('click', closeSidePeek);
  
  DOM.btnToggleAnswered.addEventListener('click', () => {
    DOM.btnToggleAnswered.classList.toggle('active');
    DOM.answeredPrayersList.classList.toggle('hidden');
  });
  
  DOM.btnAddPrayer.addEventListener('click', addNewPrayer);
  DOM.newPrayerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addNewPrayer();
  });
  
  DOM.editPersonName.addEventListener('blur', savePersonChanges);
  DOM.editPersonCategory.addEventListener('change', savePersonChanges);
  DOM.btnDeletePerson.addEventListener('click', () => {
    if (state.selectedPerson) deletePerson(state.selectedPerson.id);
  });
}

// Iniciar
init();
