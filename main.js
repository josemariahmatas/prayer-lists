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
};

// Variables para modales
let editingCategoryId = null;
let editingMatterId = null;

// --- INICIALIZACIÓN ---
async function init() {
  setAppMode('view');
  setupEventListeners();
  
  // Verificar si la base de datos está vacía para auto-importar
  const catsSnap = await getDocs(collection(db, 'categories'));
  if (catsSnap.empty) {
    console.log("Base de datos vacía. Precargando listas iniciales de forma automática...");
    await importInitialData();
  } else {
    loadRealtimeData();
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
    
    // Ordenar según el orden inicial establecido
    state.categories.sort((a, b) => {
      const indexA = CATEGORY_ORDER.indexOf(a.id);
      const indexB = CATEGORY_ORDER.indexOf(b.id);
      
      // Si son categorías nuevas creadas por el usuario, se colocan al final por orden de creación
      if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      
      return indexA - indexB;
    });
    
    renderCategoriesSidebar();
    updateCategorySelectOptions();
    renderPeople();
  });

  // 2. Escuchar Personas (Toda la colección)
  const peopleQuery = query(collection(db, 'people'));
  onSnapshot(peopleQuery, (snapshot) => {
    state.people = [];
    snapshot.forEach((doc) => {
      state.people.push({ id: doc.id, ...doc.data() });
    });
    
    // Ordenar personas alfabéticamente
    state.people.sort((a, b) => a.name.localeCompare(b.name));
    
    renderPeople();
    
    // Actualizar side-peek si está abierto
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
    
    // 1. Importar Categorías
    INITIAL_CATEGORIES.forEach((cat) => {
      const catRef = doc(collection(db, 'categories'), cat.id);
      batch.set(catRef, {
        name: cat.name,
        color: cat.color
      });
    });
    
    // 2. Importar Personas
    INITIAL_PEOPLE.forEach((person) => {
      const personRef = doc(collection(db, 'people'));
      batch.set(personRef, {
        name: person.name,
        category: person.category,
        prayers: person.prayers,
        createdAt: new Date()
      });
    });
    
    // 3. Importar Asuntos
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

// 1. Renderizar Categorías en Sidebar (Enlaces de navegación rápida)
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
      
      // Ir a la sección y expandirla
      scrollToCategorySection(cat.id);
      closeMobileSidebar();
    });
    
    DOM.categoriesList.appendChild(li);
  });
  
  applyModeVisibility();
}

// Desplazarse suavemente a una categoría y expandirla si está colapsada
function scrollToCategorySection(categoryId) {
  setActiveTab('people');
  
  const section = document.getElementById(`category-sec-${categoryId}`);
  if (section) {
    // Si estaba colapsada, expandirla
    if (state.collapsedCategories[categoryId]) {
      state.collapsedCategories[categoryId] = false;
      section.classList.remove('collapsed');
      const arrow = section.querySelector('.category-arrow svg');
      if (arrow) arrow.style.transform = '';
    }
    
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// 2. Renderizar Lista Unificada de Personas agrupadas por Categorías
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
    // Filtrar personas de esta categoría y por la búsqueda
    const catPeople = state.people.filter(person => 
      person.category === cat.id &&
      person.name.toLowerCase().includes(state.searchQuery.toLowerCase())
    );
    
    // Si estamos buscando y la categoría no tiene resultados, no la renderizamos
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
      
      <div class="cards-grid">
        <!-- Renderizado de las tarjetas de personas -->
      </div>
    `;
    
    // Evento de Contraer/Expandir
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
    
    // Renderizar tarjetas de la categoría
    const grid = section.querySelector('.cards-grid');
    if (catPeople.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 12px; font-size: 13px; color: var(--text-secondary);">No hay nadie en esta categoría.</div>`;
    } else {
      catPeople.forEach((person) => {
        const card = document.createElement('article');
        card.className = 'person-card';
        
        // Obtener peticiones activas
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
  
  // Si estamos buscando y no hay resultados globales
  if (state.searchQuery && totalRendered === 0) {
    DOM.categoriesContainer.innerHTML = `<div class="empty-state"><p>No se encontraron oraciones para "${state.searchQuery}"</p></div>`;
  }
  
  applyModeVisibility();
}

// 3. Renderizar Asuntos Pendientes
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
    
    // Evento de Checkbox
    const checkbox = item.querySelector('.custom-checkbox');
    checkbox.addEventListener('change', (e) => {
      toggleMatterStatus(matter.id, e.target.checked);
    });
    
    // Eventos de edición/eliminación
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

// --- GESTIÓN DE SIDE-PEEK (Detalles de Persona) ---

function openSidePeek(person) {
  state.selectedPerson = person;
  
  // Llenar datos en UI
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

// Añadir nueva persona
async function addPerson() {
  const name = prompt("Nombre de la persona por la que rezar:");
  if (!name || !name.trim()) return;
  
  // Asignar por defecto a la primera categoría disponible
  const defaultCategory = state.categories.length > 0 ? state.categories[0].id : 'especiales';
  
  try {
    const docRef = await addDoc(collection(db, 'people'), {
      name: name.trim(),
      category: defaultCategory,
      prayers: [],
      createdAt: new Date()
    });
    
    const newPerson = {
      id: docRef.id,
      name: name.trim(),
      category: defaultCategory,
      prayers: []
    };
    openSidePeek(newPerson);
  } catch (error) {
    console.error("Error añadiendo persona:", error);
  }
}

async function savePersonChanges() {
  if (!state.selectedPerson) return;
  
  const newName = DOM.editPersonName.value.trim();
  const newCat = DOM.editPersonCategory.value;
  
  if (!newName) return;
  
  try {
    await updateDoc(doc(db, 'people', state.selectedPerson.id), {
      name: newName,
      category: newCat
    });
  } catch (error) {
    console.error("Error guardando cambios del contacto:", error);
  }
}

async function deletePerson(id) {
  const confirmDel = confirm("¿Seguro que deseas eliminar a esta persona de la lista?");
  if (!confirmDel) return;
  
  try {
    await deleteDoc(doc(db, 'people', id));
    if (state.selectedPerson && state.selectedPerson.id === id) {
      closeSidePeek();
    }
  } catch (error) {
    console.error("Error eliminando persona:", error);
  }
}

// Crear / Editar Categoría
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

async function deleteCategory() {
  if (!editingCategoryId) return;
  
  const confirmDel = confirm("¿Deseas eliminar esta categoría? (Las personas asignadas seguirán existiendo pero no tendrán categoría).");
  if (!confirmDel) return;
  
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

// Guardar Asunto
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

async function deleteMatter(id) {
  const confirmDel = confirm("¿Seguro que quieres eliminar este asunto?");
  if (!confirmDel) return;
  
  try {
    await deleteDoc(doc(db, 'matters', id));
    closeMatterModal();
  } catch (error) {
    console.error("Error eliminando asunto:", error);
  }
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
  
  applyModeVisibility();
  
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

// Cerrar sidebar móvil
function closeMobileSidebar() {
  DOM.appSidebar.classList.remove('active');
  DOM.sidebarBackdrop.classList.remove('active');
}

// --- MANEJADORES DE EVENTOS ---
function setupEventListeners() {
  // Toggle Sidebar en móvil
  DOM.sidebarToggle.addEventListener('click', () => {
    DOM.appSidebar.classList.add('active');
    DOM.sidebarBackdrop.classList.add('active');
  });
  
  // Cerrar sidebar al hacer click en el backdrop
  DOM.sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  
  // Tabs en la barra lateral
  DOM.tabPeople.addEventListener('click', () => {
    setActiveTab('people');
    closeMobileSidebar();
  });
  DOM.tabMatters.addEventListener('click', () => {
    setActiveTab('matters');
    closeMobileSidebar();
  });
  
  // Selector de Modo
  DOM.modeView.addEventListener('click', () => setAppMode('view'));
  DOM.modeEdit.addEventListener('click', () => setAppMode('edit'));
  
  // Buscador
  DOM.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (state.activeTab === 'people') renderPeople();
    else renderMatters();
  });
  
  // Añadir personas y asuntos
  DOM.btnAddPerson.addEventListener('click', addPerson);
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
  
  // Añadir peticiones concretas en side-peek
  DOM.btnAddPrayer.addEventListener('click', addNewPrayer);
  DOM.newPrayerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addNewPrayer();
  });
  
  // Guardar cambios al perder foco
  DOM.editPersonName.addEventListener('blur', savePersonChanges);
  DOM.editPersonCategory.addEventListener('change', savePersonChanges);
  DOM.btnDeletePerson.addEventListener('click', () => {
    if (state.selectedPerson) deletePerson(state.selectedPerson.id);
  });
}

// Iniciar
init();
