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

// --- ORDEN DE CATEGORÍAS FIJO POR DEFECTO (Si no tienen order en Firestore) ---
const CATEGORY_ORDER = INITIAL_CATEGORIES.map(c => c.id);

// --- ESTADO DE LA APLICACIÓN ---
let state = {
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
  
  tabPeople: document.getElementById('tab-people'),
  tabMatters: document.getElementById('tab-matters'),
  
  peopleSection: document.getElementById('people-section'),
  mattersSection: document.getElementById('matters-section'),
  
  searchInput: document.getElementById('search-input'),
  
  // Botones de añadir
  btnAddPerson: document.getElementById('btn-add-person'),
  btnAddMatter: document.getElementById('btn-add-matter'),
  btnHeaderAdd: document.getElementById('btn-header-add'),
  mobileAddBtn: document.getElementById('mobile-add-btn'),
  
  categoriesContainer: document.getElementById('categories-container'),
  peopleEmpty: document.getElementById('people-empty'),
  
  mattersList: document.getElementById('matters-list'),
  mattersEmpty: document.getElementById('matters-empty'),
  btnEmptyAddMatter: document.getElementById('btn-empty-add-matter'),
  
  // Side Peek Notion Style
  sideOverlay: document.getElementById('side-overlay'),
  sidePeek: document.getElementById('side-peek'),
  btnClosePeek: document.getElementById('btn-close-peek'),
  peekPersonNameInput: document.getElementById('peek-person-name-input'),
  peekPersonCategorySelect: document.getElementById('peek-person-category-select'),
  prayersCount: document.getElementById('prayers-count'),
  newPrayerInput: document.getElementById('new-prayer-input'),
  btnAddPrayer: document.getElementById('btn-add-prayer'),
  activePrayersList: document.getElementById('active-prayers-list'),
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
  
  // Modal Unificado de Carga (Añadir Entrada)
  addEntryModal: document.getElementById('add-entry-modal'),
  btnSelectPerson: document.getElementById('btn-select-person'),
  btnSelectMatter: document.getElementById('btn-select-matter'),
  formFieldsPerson: document.getElementById('form-fields-person'),
  formFieldsMatter: document.getElementById('form-fields-matter'),
  
  entryPersonName: document.getElementById('entry-person-name'),
  entryPersonCat: document.getElementById('entry-person-cat'),
  inlineCategoryCreator: document.getElementById('inline-category-creator'),
  newCatNameInput: document.getElementById('new-cat-name-input'),
  inlineColorPicker: document.getElementById('inline-color-picker'),
  entryPersonPrayer: document.getElementById('entry-person-prayer'),
  
  entryMatterTitle: document.getElementById('entry-matter-title'),
  entryMatterDesc: document.getElementById('entry-matter-desc'),
  entryMatterCat: document.getElementById('entry-matter-cat'),
  
  btnCancelEntry: document.getElementById('btn-cancel-entry'),
  btnSaveEntry: document.getElementById('btn-save-entry'),
  btnCloseEntryModal: document.getElementById('btn-close-entry-modal'),

  // Modal Confirmación
  confirmModal: document.getElementById('confirm-modal'),
  confirmModalTitle: document.getElementById('confirm-modal-title'),
  confirmModalMessage: document.getElementById('confirm-modal-message'),
  btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
  btnConfirmOk: document.getElementById('btn-confirm-ok'),
};

// Variables para modales y drag scroll
let editingCategoryId = null;
let activeConfirmCallback = null;
let dragScrollInterval = null;
let activeSwipedContainer = null;
let activeEntryType = 'person'; // 'person' o 'matter'

// --- INICIALIZACIÓN ---
async function init() {
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

  // 2. Disposición de Columnas (Por defecto modo 1 columna!)
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

// --- GESTOS DE DESLIZAMIENTO A LA IZQUIERDA (SWIPE TO DELETE) ---
function initSwipeEvents(container, onDelete) {
  const content = container.querySelector('.swipe-content');
  let startX = 0;
  let startY = 0;
  let isSwiping = false;
  
  function closeActiveSwipe() {
    if (activeSwipedContainer && activeSwipedContainer !== container) {
      activeSwipedContainer.classList.remove('swiped-left');
    }
  }
  
  container.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwiping = false;
    closeActiveSwipe();
  }, { passive: true });
  
  container.addEventListener('touchmove', (e) => {
    const diffX = startX - e.touches[0].clientX;
    const diffY = startY - e.touches[0].clientY;
    
    if (Math.abs(diffX) > Math.abs(diffY)) {
      isSwiping = true;
      if (diffX > 40) {
        container.classList.add('swiped-left');
        activeSwipedContainer = container;
      } else if (diffX < -30) {
        container.classList.remove('swiped-left');
        if (activeSwipedContainer === container) activeSwipedContainer = null;
      }
    }
  }, { passive: true });
  
  // Drag con mouse para emular deslizamiento en PC
  let isMouseDown = false;
  
  container.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('.swipe-delete-reveal')) return;
    isMouseDown = true;
    startX = e.clientX;
    closeActiveSwipe();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    const diffX = startX - e.clientX;
    if (diffX > 45) {
      container.classList.add('swiped-left');
      activeSwipedContainer = container;
      isMouseDown = false;
    } else if (diffX < -35) {
      container.classList.remove('swiped-left');
      if (activeSwipedContainer === container) activeSwipedContainer = null;
      isMouseDown = false;
    }
  });
  
  document.addEventListener('mouseup', () => {
    isMouseDown = false;
  });
  
  // Acción del botón papelera
  const delBtn = container.querySelector('.swipe-delete-reveal');
  if (delBtn) {
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete();
      if (activeSwipedContainer === container) activeSwipedContainer = null;
    });
  }
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
    
    // Ordenar según el orden dinámico en base de datos
    state.categories.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : CATEGORY_ORDER.indexOf(a.id);
      const orderB = b.order !== undefined ? b.order : CATEGORY_ORDER.indexOf(b.id);
      
      if (orderA === -1 && orderB === -1) return a.name.localeCompare(b.name);
      if (orderA === -1) return 1;
      if (orderB === -1) return -1;
      
      return orderA - orderB;
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
    
    // Ordenar personas por su orden dinámico en Firestore
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

// --- LOGICA DE IMPORTACIÓN INICIAL ---
async function importInitialData() {
  try {
    const batch = writeBatch(db);
    
    INITIAL_CATEGORIES.forEach((cat, idx) => {
      const catRef = doc(collection(db, 'categories'), cat.id);
      batch.set(catRef, {
        name: cat.name,
        color: cat.color,
        order: idx
      });
    });
    
    INITIAL_PEOPLE.forEach((person, index) => {
      const personRef = doc(collection(db, 'people'));
      batch.set(personRef, {
        name: person.name,
        category: person.category,
        prayers: person.prayers || [],
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
          <button class="menu-item-edit edit-element" data-id="${cat.id}" title="Editar categoría">
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
      <button class="category-header-toggle" data-id="${cat.id}" draggable="true">
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
    
    // --- ACCIÓN DE COLLAPSE EN CLICK ---
    toggleBtn.addEventListener('click', (e) => {
      // Si se está arrastrando, ignorar click
      if (e.defaultPrevented) return;
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

    // --- DRAG & DROP DE CATEGORÍAS ---
    toggleBtn.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/category', cat.id);
      toggleBtn.classList.add('dragging');
    });
    
    toggleBtn.addEventListener('dragend', () => {
      toggleBtn.classList.remove('dragging');
      document.querySelectorAll('.category-header-toggle').forEach(h => h.classList.remove('drag-over-cat'));
    });
    
    toggleBtn.addEventListener('dragover', (e) => {
      e.preventDefault();
      handleDragScroll(e);
      toggleBtn.classList.add('drag-over-cat');
    });
    
    toggleBtn.addEventListener('dragleave', () => {
      toggleBtn.classList.remove('drag-over-cat');
    });
    
    toggleBtn.addEventListener('drop', async (e) => {
      e.preventDefault();
      toggleBtn.classList.remove('drag-over-cat');
      stopDragScroll();
      
      const draggedCatId = e.dataTransfer.getData('text/category');
      if (!draggedCatId || draggedCatId === cat.id) return;
      
      const draggedIdx = state.categories.findIndex(c => c.id === draggedCatId);
      const targetIdx = state.categories.findIndex(c => c.id === cat.id);
      if (draggedIdx === -1 || targetIdx === -1) return;
      
      // Mover categoría localmente
      const [draggedCat] = state.categories.splice(draggedIdx, 1);
      state.categories.splice(targetIdx, 0, draggedCat);
      
      // Guardar el nuevo orden de categorías en Firestore
      try {
        const batch = writeBatch(db);
        state.categories.forEach((c, idx) => {
          batch.update(doc(db, 'categories', c.id), { order: idx });
        });
        await batch.commit();
      } catch (err) {
        console.error("Error guardando orden de categorías:", err);
      }
    });
    
    const grid = section.querySelector('.cards-grid');
    
    // DRAG OVER GRID
    grid.addEventListener('dragover', (e) => {
      e.preventDefault();
      handleDragScroll(e);
      grid.classList.add('drag-over');
    });
    
    grid.addEventListener('dragleave', () => {
      grid.classList.remove('drag-over');
    });
    
    grid.addEventListener('drop', async (e) => {
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
        // Envoltura para swipe-to-delete
        const swipeContainer = document.createElement('div');
        swipeContainer.className = 'swipe-container';
        
        const activePrayers = person.prayers ? person.prayers.filter(p => p.status === 'active') : [];
        
        let prayersHtml = '';
        if (activePrayers.length > 0) {
          prayersHtml = `<div class="person-card-prayers">`;
          activePrayers.forEach((p) => {
            prayersHtml += `<span class="small-prayer-bullet" title="${p.text}">• ${p.text}</span>`;
          });
          prayersHtml += `</div>`;
        }
        
        swipeContainer.innerHTML = `
          <!-- Capa oculta trasera para eliminar -->
          <div class="swipe-delete-reveal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
          </div>
          <!-- Tarjeta real -->
          <article class="person-card swipe-content" draggable="true" data-id="${person.id}">
            <div class="person-card-header">
              <h3 class="person-name">${person.name}</h3>
            </div>
            ${prayersHtml}
          </article>
        `;
        
        const card = swipeContainer.querySelector('.person-card');
        
        // --- EVENTO DE SWIPE A LA IZQUIERDA ---
        initSwipeEvents(swipeContainer, () => {
          // Eliminar directamente sin confirmación por gesto
          deletePersonDoc(person.id);
        });

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
          if (swipeContainer.classList.contains('swiped-left')) return;
          openSidePeek(person);
        });
        
        grid.appendChild(swipeContainer);
      });
    }
    
    DOM.categoriesContainer.appendChild(section);
  });
  
  if (state.searchQuery && totalRendered === 0) {
    DOM.categoriesContainer.innerHTML = `<div class="empty-state"><p>No se encontraron oraciones para "${state.searchQuery}"</p></div>`;
  }
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
    const swipeContainer = document.createElement('div');
    swipeContainer.className = 'swipe-container';
    
    const isAnswered = matter.status === 'answered';
    
    swipeContainer.innerHTML = `
      <!-- Capa trasera roja de eliminar -->
      <div class="swipe-delete-reveal">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
      </div>
      <!-- Asunto item real -->
      <div class="matter-item swipe-content ${isAnswered ? 'answered' : ''}">
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
      </div>
    `;
    
    // --- GESTOS DE DESLIZAMIENTO ---
    initSwipeEvents(swipeContainer, () => {
      // Eliminar directamente sin confirmación
      deleteMatterDoc(matter.id);
    });

    const checkbox = swipeContainer.querySelector('.custom-checkbox');
    checkbox.addEventListener('change', (e) => {
      toggleMatterStatus(matter.id, e.target.checked);
    });
    
    // Click para editar
    const itemBody = swipeContainer.querySelector('.matter-body');
    itemBody.addEventListener('click', () => {
      if (swipeContainer.classList.contains('swiped-left')) return;
      openMatterEditInModal(matter);
    });
    
    DOM.mattersList.appendChild(swipeContainer);
  });
}

// --- GESTIÓN DE SIDE-PEEK NOTION STYLE ---

function openSidePeek(person) {
  state.selectedPerson = person;
  
  DOM.peekPersonNameInput.value = person.name;
  
  // Cargar selector de categorías
  DOM.peekPersonCategorySelect.innerHTML = '';
  state.categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    DOM.peekPersonCategorySelect.appendChild(opt);
  });
  DOM.peekPersonCategorySelect.value = person.category;
  
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
  
  DOM.prayersCount.textContent = `${activePrayers.length} ${activePrayers.length === 1 ? 'activa' : 'activas'}`;
  
  // Renderizar Activas
  DOM.activePrayersList.innerHTML = '';
  if (activePrayers.length === 0) {
    DOM.activePrayersList.innerHTML = `<li style="padding: 10px 12px; font-size:13px; color:var(--text-secondary); text-align:center;">No tiene peticiones concretas registradas.</li>`;
  } else {
    activePrayers.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'prayer-item';
      li.innerHTML = `
        <input type="checkbox" class="custom-checkbox" data-prayer-id="${p.id}">
        <span class="prayer-text">${p.text}</span>
        <button class="btn-icon btn-delete-prayer" data-prayer-id="${p.id}" title="Eliminar petición">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
        </button>
      `;
      
      // Marcar checkbox = Eliminar directamente (No guardamos oraciones respondidas/finalizadas)
      li.querySelector('input').addEventListener('change', () => {
        deletePrayer(state.selectedPerson.id, p.id);
      });
      
      const btnDel = li.querySelector('.btn-delete-prayer');
      btnDel.addEventListener('click', () => {
        deletePrayer(state.selectedPerson.id, p.id);
      });
      
      DOM.activePrayersList.appendChild(li);
    });
  }
}

function updateCategorySelectOptions() {
  DOM.entryPersonCat.innerHTML = '';
  state.categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    DOM.entryPersonCat.appendChild(opt);
  });
  
  // Opción especial al final para crear una inline
  const createOpt = document.createElement('option');
  createOpt.value = 'create-new-cat';
  createOpt.textContent = '➕ Crear nueva categoría...';
  DOM.entryPersonCat.appendChild(createOpt);
}

// --- ACCIONES FIRESTORE ---

async function toggleMatterStatus(id, checked) {
  try {
    await updateDoc(doc(db, 'matters', id), {
      status: checked ? 'answered' : 'active'
    });
  } catch (error) {
    console.error("Error actualizando estado del asunto:", error);
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
  
  // Filtrar fuera y remover por completo
  const prayers = (state.selectedPerson.prayers || []).filter(p => p.id !== prayerId);
  
  try {
    await updateDoc(doc(db, 'people', personId), { prayers });
  } catch (error) {
    console.error("Error eliminando petición:", error);
  }
}

// Modificación inline desde Side-Peek al perder foco o cambiar
async function savePersonChangesInline() {
  if (!state.selectedPerson) return;
  
  const newName = DOM.peekPersonNameInput.value.trim();
  const newCat = DOM.peekPersonCategorySelect.value;
  
  if (!newName) return;
  
  try {
    const updates = { name: newName };
    
    if (newCat !== state.selectedPerson.category) {
      const targetCatPeople = state.people.filter(p => p.category === newCat);
      updates.category = newCat;
      updates.order = targetCatPeople.length;
    }
    
    await updateDoc(doc(db, 'people', state.selectedPerson.id), updates);
  } catch (error) {
    console.error("Error actualizando persona inline:", error);
  }
}

// Borrar persona directo desde Side-Peek
function deletePersonFromPeek() {
  if (!state.selectedPerson) return;
  
  const name = state.selectedPerson.name;
  showConfirmModal(
    "Eliminar Persona",
    `¿Deseas eliminar a ${name} de tus listas de oración?`,
    () => deletePersonDoc(state.selectedPerson.id)
  );
}

async function deletePersonDoc(id) {
  try {
    await deleteDoc(doc(db, 'people', id));
    if (state.selectedPerson && state.selectedPerson.id === id) {
      closeSidePeek();
    }
  } catch (err) {
    console.error("Error al borrar persona:", err);
  }
}

async function deleteMatterDoc(id) {
  try {
    await deleteDoc(doc(db, 'matters', id));
  } catch (err) {
    console.error("Error al borrar asunto:", err);
  }
}

// Cargar Asunto en la ventana para Editar
function openMatterEditInModal(matter) {
  // Cambiar pestaña del modal a Asunto
  setEntryModalType('matter');
  
  // Setear variables
  editingCategoryId = null; // No estamos editando categoría
  // Guardamos el ID del asunto que editamos en una propiedad temporal
  DOM.addEntryModal.setAttribute('data-editing-matter-id', matter.id);
  
  DOM.modalEntryTitle.textContent = "Editar Asunto";
  DOM.entryMatterTitle.value = matter.title;
  DOM.entryMatterDesc.value = matter.description || '';
  DOM.entryMatterCat.value = matter.category || 'General';
  
  // Mostrar modal
  DOM.addEntryModal.classList.remove('hidden');
  DOM.entryMatterTitle.focus();
}

// Guardar Categoría
async function saveCategory() {
  const name = DOM.categoryNameInput.value.trim();
  const selectedDot = DOM.colorPickerGrid.querySelector('.color-dot.active');
  const color = selectedDot ? selectedDot.getAttribute('data-color') : 'pink';
  
  if (!name) return;
  
  try {
    if (editingCategoryId) {
      await updateDoc(doc(db, 'categories', editingCategoryId), { name, color });
    } else {
      const nextOrder = state.categories.length;
      await addDoc(collection(db, 'categories'), { name, color, order: nextOrder });
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

// --- MODAL UNIFICADO: AÑADIR/EDITAR ENTRADAS (GENTE Y ASUNTOS) ---

function openAddEntryModal(type = 'person') {
  setEntryModalType(type);
  
  // Limpiar campos
  DOM.entryPersonName.value = '';
  DOM.entryPersonPrayer.value = '';
  DOM.newCatNameInput.value = '';
  DOM.inlineCategoryCreator.classList.add('hidden');
  
  DOM.entryMatterTitle.value = '';
  DOM.entryMatterDesc.value = '';
  DOM.entryMatterCat.value = 'General';
  
  // Resetear ID de edición
  DOM.addEntryModal.removeAttribute('data-editing-matter-id');
  DOM.modalEntryTitle.textContent = "Añadir Entrada";
  
  // Seleccionar la primera categoría de forma predeterminada
  if (state.categories.length > 0) {
    DOM.entryPersonCat.value = state.categories[0].id;
  }
  
  DOM.addEntryModal.classList.remove('hidden');
  
  if (type === 'person') {
    DOM.entryPersonName.focus();
  } else {
    DOM.entryMatterTitle.focus();
  }
}

function closeAddEntryModal() {
  DOM.addEntryModal.classList.add('hidden');
}

function setEntryModalType(type) {
  activeEntryType = type;
  if (type === 'person') {
    DOM.btnSelectPerson.classList.add('active');
    DOM.btnSelectMatter.classList.remove('active');
    DOM.formFieldsPerson.classList.remove('hidden');
    DOM.formFieldsMatter.classList.add('hidden');
  } else {
    DOM.btnSelectMatter.classList.add('active');
    DOM.btnSelectPerson.classList.remove('active');
    DOM.formFieldsMatter.classList.remove('hidden');
    DOM.formFieldsPerson.classList.add('hidden');
  }
}

// Guardado unificado de entradas
async function saveAddEntry() {
  if (activeEntryType === 'person') {
    const name = DOM.entryPersonName.value.trim();
    let category = DOM.entryPersonCat.value;
    const initialPrayer = DOM.entryPersonPrayer.value.trim();
    
    if (!name) return;
    
    try {
      // Si eligen "Crear nueva categoría..."
      if (category === 'create-new-cat') {
        const newCatName = DOM.newCatNameInput.value.trim();
        if (!newCatName) return;
        
        const activeColorDot = DOM.inlineColorPicker.querySelector('.color-dot.active');
        const color = activeColorDot ? activeColorDot.getAttribute('data-color') : 'pink';
        
        const nextOrder = state.categories.length;
        const catRef = await addDoc(collection(db, 'categories'), {
          name: newCatName,
          color,
          order: nextOrder
        });
        category = catRef.id;
      }
      
      const currentMembers = state.people.filter(p => p.category === category);
      const orderIndex = currentMembers.length;
      
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
        order: orderIndex,
        createdAt: new Date()
      });
      
      closeAddEntryModal();
      
      // Auto-abrir Side Peek de la nueva persona
      const newPerson = {
        id: docRef.id,
        name,
        category,
        prayers
      };
      openSidePeek(newPerson);
      
    } catch (err) {
      console.error("Error al guardar persona desde modal unificado:", err);
    }
    
  } else {
    // Es un asunto
    const title = DOM.entryMatterTitle.value.trim();
    const description = DOM.entryMatterDesc.value.trim();
    const category = DOM.entryMatterCat.value.trim() || 'General';
    const editingId = DOM.addEntryModal.getAttribute('data-editing-matter-id');
    
    if (!title) return;
    
    try {
      if (editingId) {
        // Guardando cambios de asunto editado
        await updateDoc(doc(db, 'matters', editingId), {
          title,
          description,
          category
        });
      } else {
        // Añadiendo asunto nuevo
        await addDoc(collection(db, 'matters'), {
          title,
          description,
          category,
          status: 'active',
          createdAt: new Date()
        });
      }
      closeAddEntryModal();
    } catch (err) {
      console.error("Error al guardar asunto:", err);
    }
  }
}

// --- MODALES CATEGORÍAS ---

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

// --- NAVEGACIÓN ENTRE TABS ---

function scrollToCategorySection(categoryId) {
  setActiveTab('people');
  
  setTimeout(() => {
    const section = document.getElementById(`category-sec-${categoryId}`);
    if (section) {
      if (state.collapsedCategories[categoryId]) {
        state.collapsedCategories[categoryId] = false;
        section.classList.remove('collapsed');
        const arrow = section.querySelector('.category-arrow svg');
        if (arrow) arrow.style.transform = 'none';
      }
      
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}

function setActiveTab(tab) {
  state.activeTab = tab;
  
  if (tab === 'people') {
    DOM.tabPeople.classList.add('active');
    DOM.tabMatters.classList.remove('active');
    DOM.peopleSection.classList.add('active');
    DOM.mattersSection.classList.remove('active');
    DOM.mainAppTitle.textContent = "Listas";
  } else {
    DOM.tabPeople.classList.remove('active');
    DOM.tabMatters.classList.add('active');
    DOM.peopleSection.classList.remove('active');
    DOM.mattersSection.classList.add('active');
    DOM.mainAppTitle.textContent = "Asuntos Pendientes";
  }
  
  DOM.searchInput.value = '';
  state.searchQuery = '';
}

function closeMobileSidebar() {
  DOM.appSidebar.classList.remove('active');
  DOM.sidebarBackdrop.classList.remove('active');
}

// --- MANEJADORES DE EVENTOS ---
function setupEventListeners() {
  // Hamburguesa móvil
  DOM.sidebarToggle.addEventListener('click', () => {
    DOM.appSidebar.classList.add('active');
    DOM.sidebarBackdrop.classList.add('active');
  });
  
  DOM.sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  
  // Ajustes de Tema y Columnas
  DOM.themeLight.addEventListener('click', () => setTheme('light'));
  DOM.themeDark.addEventListener('click', () => setTheme('dark'));
  DOM.layout1Col.addEventListener('click', () => setLayout('1-col'));
  DOM.layout2Col.addEventListener('click', () => setLayout('2-col'));
  
  // Navegación Sidebar tabs
  DOM.tabPeople.addEventListener('click', () => {
    setActiveTab('people');
    closeMobileSidebar();
  });
  DOM.tabMatters.addEventListener('click', () => {
    setActiveTab('matters');
    closeMobileSidebar();
  });
  
  // Buscador
  DOM.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (state.activeTab === 'people') renderPeople();
    else renderMatters();
  });
  
  // --- LISTENERS BOTONES AÑADIR RÁPIDO ---
  DOM.btnAddPerson.addEventListener('click', () => openAddEntryModal('person'));
  DOM.btnAddMatter.addEventListener('click', () => openAddEntryModal('matter'));
  DOM.btnHeaderAdd.addEventListener('click', () => openAddEntryModal(state.activeTab === 'people' ? 'person' : 'matter'));
  DOM.mobileAddBtn.addEventListener('click', () => openAddEntryModal(state.activeTab === 'people' ? 'person' : 'matter'));
  
  DOM.btnEmptyAddMatter.addEventListener('click', () => openAddEntryModal('matter'));
  
  // Modals Categorías
  DOM.btnAddCategory.addEventListener('click', () => openCategoryModal());
  DOM.btnCancelCategory.addEventListener('click', closeCategoryModal);
  DOM.btnCloseCategoryModal.addEventListener('click', closeCategoryModal);
  DOM.btnSaveCategory.addEventListener('click', saveCategory);
  DOM.btnDeleteCategory.addEventListener('click', deleteCategory);
  
  // Color Picker Modal Categoría
  DOM.colorPickerGrid.addEventListener('click', (e) => {
    const dot = e.target.closest('.color-dot');
    if (dot) {
      DOM.colorPickerGrid.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    }
  });

  // --- LISTENERS MODAL DE ENTRADAS UNIFICADO ---
  DOM.btnSelectPerson.addEventListener('click', () => setEntryModalType('person'));
  DOM.btnSelectMatter.addEventListener('click', () => setEntryModalType('matter'));
  
  DOM.entryPersonCat.addEventListener('change', (e) => {
    if (e.target.value === 'create-new-cat') {
      DOM.inlineCategoryCreator.classList.remove('hidden');
      DOM.newCatNameInput.focus();
    } else {
      DOM.inlineCategoryCreator.classList.add('hidden');
    }
  });

  DOM.inlineColorPicker.addEventListener('click', (e) => {
    const dot = e.target.closest('.color-dot');
    if (dot) {
      DOM.inlineColorPicker.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    }
  });

  DOM.btnCloseEntryModal.addEventListener('click', closeAddEntryModal);
  DOM.btnCancelEntry.addEventListener('click', closeAddEntryModal);
  DOM.btnSaveEntry.addEventListener('click', saveAddEntry);
  
  // Keypress enter en modal unificado
  DOM.entryPersonName.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveAddEntry(); });
  DOM.entryPersonPrayer.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveAddEntry(); });
  DOM.newCatNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveAddEntry(); });
  DOM.entryMatterTitle.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveAddEntry(); });

  // Modal Confirmación
  DOM.btnConfirmCancel.addEventListener('click', closeConfirmModal);
  DOM.btnConfirmOk.addEventListener('click', () => {
    if (activeConfirmCallback) activeConfirmCallback();
    closeConfirmModal();
  });
  
  // Side Peek Notion Style Listeners
  DOM.btnClosePeek.addEventListener('click', closeSidePeek);
  DOM.sideOverlay.addEventListener('click', closeSidePeek);
  
  DOM.btnAddPrayer.addEventListener('click', addNewPrayer);
  DOM.newPrayerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addNewPrayer();
  });
  
  // Guardado inline automático
  DOM.peekPersonNameInput.addEventListener('change', savePersonChangesInline);
  DOM.peekPersonNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      savePersonChangesInline();
      DOM.peekPersonNameInput.blur();
    }
  });
  DOM.peekPersonCategorySelect.addEventListener('change', savePersonChangesInline);
  DOM.btnDeletePerson.addEventListener('click', deletePersonFromPeek);
}

// Iniciar
init();
