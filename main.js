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
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';

import { INITIAL_CATEGORIES, INITIAL_PEOPLE, INITIAL_MATTERS } from './initial-data.js';

// --- ESTADO DE LA APLICACIÓN ---
let state = {
  currentMode: 'view', // 'view' o 'edit'
  activeTab: 'people', // 'people' o 'matters'
  activeCategoryId: 'especiales',
  categories: [],
  people: [],
  matters: [],
  selectedPerson: null, // Persona abierta en el Side-Peek
  searchQuery: '',
};

// --- ELEMENTOS DEL DOM ---
const DOM = {
  importBanner: document.getElementById('import-banner'),
  btnImportYes: document.getElementById('btn-import-yes'),
  btnImportNo: document.getElementById('btn-import-no'),
  
  sidebarToggle: document.getElementById('sidebar-toggle'),
  appSidebar: document.getElementById('app-sidebar'),
  categoriesList: document.getElementById('categories-list'),
  btnAddCategory: document.getElementById('btn-add-category'),
  
  activeCategoryTitle: document.getElementById('active-category-title'),
  activeCategoryBadge: document.getElementById('active-category-badge'),
  
  modeView: document.getElementById('mode-view'),
  modeEdit: document.getElementById('mode-edit'),
  
  tabPeople: document.getElementById('tab-people'),
  tabMatters: document.getElementById('tab-matters'),
  
  peopleSection: document.getElementById('people-section'),
  mattersSection: document.getElementById('matters-section'),
  
  searchInput: document.getElementById('search-input'),
  btnAddPerson: document.getElementById('btn-add-person'),
  btnAddMatter: document.getElementById('btn-add-matter'),
  
  peopleGrid: document.getElementById('people-grid'),
  peopleEmpty: document.getElementById('people-empty'),
  btnEmptyAddPerson: document.getElementById('btn-empty-add-person'),
  
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

// Variable para controlar qué categoría se está editando en el modal
let editingCategoryId = null;
let editingMatterId = null;

// --- INICIALIZACIÓN ---
async function init() {
  setAppMode('view');
  setupEventListeners();
  
  // 1. Verificar si la base de datos está vacía para sugerir importación
  const catsSnap = await getDocs(collection(db, 'categories'));
  if (catsSnap.empty) {
    DOM.importBanner.classList.remove('hidden');
  } else {
    loadRealtimeData();
  }
}

// --- CONEXIÓN A FIRESTORE EN TIEMPO REAL ---
function loadRealtimeData() {
  // 1. Escuchar Categorías
  const categoriesQuery = query(collection(db, 'categories'), orderBy('name'));
  onSnapshot(categoriesQuery, (snapshot) => {
    state.categories = [];
    snapshot.forEach((doc) => {
      state.categories.push({ id: doc.id, ...doc.data() });
    });
    
    // Si la categoría activa no existe, poner la primera
    if (state.categories.length > 0 && !state.categories.some(c => c.id === state.activeCategoryId)) {
      state.activeCategoryId = state.categories[0].id;
    }
    
    renderCategories();
    renderActiveCategoryHeader();
    updateCategorySelectOptions();
    
    // Escuchar personas de la categoría activa (recargar si cambia la activa)
    setupPeopleListener();
  });

  // 2. Escuchar Asuntos
  const mattersQuery = query(collection(db, 'matters'), orderBy('createdAt', 'desc'));
  onSnapshot(mattersQuery, (snapshot) => {
    state.matters = [];
    snapshot.forEach((doc) => {
      state.matters.push({ id: doc.id, ...doc.data() });
    });
    renderMatters();
  });
}

let unsubscribePeople = null;
function setupPeopleListener() {
  if (unsubscribePeople) unsubscribePeople();
  
  if (!state.activeCategoryId) return;
  
  const peopleQuery = query(
    collection(db, 'people'),
    where('category', '==', state.activeCategoryId)
  );
  
  unsubscribePeople = onSnapshot(peopleQuery, (snapshot) => {
    state.people = [];
    snapshot.forEach((doc) => {
      state.people.push({ id: doc.id, ...doc.data() });
    });
    
    // Ordenar localmente por nombre para evitar índices compuestos iniciales complejos
    state.people.sort((a, b) => a.name.localeCompare(b.name));
    
    renderPeople();
    
    // Actualizar side-peek si la persona seleccionada cambió
    if (state.selectedPerson) {
      const updatedPerson = state.people.find(p => p.id === state.selectedPerson.id);
      if (updatedPerson) {
        state.selectedPerson = updatedPerson;
        updateSidePeekUI();
      } else {
        closeSidePeek(); // Si fue borrada
      }
    }
  });
}

// --- LOGICA DE IMPORTACIÓN ---
async function importInitialData() {
  DOM.btnImportYes.disabled = true;
  DOM.btnImportYes.textContent = "Importando...";
  
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
    
    // 2. Importar Personas (Firestore limita a 500 escrituras por batch, tenemos ~150 personas + 17 categorías, cabe en un batch)
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
    DOM.importBanner.classList.add('hidden');
    loadRealtimeData();
  } catch (error) {
    console.error("Error importando datos iniciales:", error);
    alert("Hubo un error al importar los datos. Inténtalo de nuevo.");
    DOM.btnImportYes.disabled = false;
    DOM.btnImportYes.textContent = "Sí, precargar lista";
  }
}

// --- RENDERIZADORES DE INTERFAZ ---

// 1. Renderizar Sidebar de Categorías
function renderCategories() {
  DOM.categoriesList.innerHTML = '';
  
  state.categories.forEach((cat) => {
    const li = document.createElement('li');
    const isActive = cat.id === state.activeCategoryId;
    
    li.innerHTML = `
      <button class="menu-item ${isActive ? 'active' : ''}" data-id="${cat.id}">
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
      // Si se hizo click en el botón de edición de la categoría
      if (e.target.closest('.menu-item-edit')) {
        e.stopPropagation();
        openCategoryModal(cat.id);
        return;
      }
      setActiveCategory(cat.id);
      
      // Cerrar sidebar en móvil tras seleccionar
      if (window.innerWidth <= 768) {
        DOM.appSidebar.classList.remove('active');
      }
    });
    
    DOM.categoriesList.appendChild(li);
  });
  
  // Actualizar visibilidad de elementos según el modo actual
  applyModeVisibility();
}

// 2. Renderizar Cabecera de Categoría Activa
function renderActiveCategoryHeader() {
  const activeCat = state.categories.find(c => c.id === state.activeCategoryId);
  if (activeCat) {
    DOM.activeCategoryTitle.textContent = activeCat.name;
    DOM.activeCategoryBadge.className = `badge ${activeCat.color}`;
    DOM.activeCategoryBadge.textContent = activeCat.color;
  } else {
    DOM.activeCategoryTitle.textContent = 'Selecciona una categoría';
    DOM.activeCategoryBadge.className = 'badge hidden';
  }
}

// 3. Renderizar Personas
function renderPeople() {
  DOM.peopleGrid.innerHTML = '';
  
  const filteredPeople = state.people.filter(person => 
    person.name.toLowerCase().includes(state.searchQuery.toLowerCase())
  );
  
  if (filteredPeople.length === 0) {
    DOM.peopleEmpty.classList.remove('hidden');
    DOM.peopleGrid.classList.add('hidden');
    return;
  }
  
  DOM.peopleEmpty.classList.add('hidden');
  DOM.peopleGrid.classList.remove('hidden');
  
  filteredPeople.forEach((person) => {
    const card = document.createElement('article');
    card.className = 'person-card';
    
    const activePrayers = person.prayers ? person.prayers.filter(p => p.status === 'active').length : 0;
    
    card.innerHTML = `
      <div class="person-card-header">
        <h3 class="person-name">${person.name}</h3>
      </div>
      <div class="person-card-prayers">
        <span>🙏</span>
        <span>${activePrayers} ${activePrayers === 1 ? 'petición activa' : 'peticiones activas'}</span>
      </div>
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
    
    DOM.peopleGrid.appendChild(card);
  });
  
  applyModeVisibility();
}

// 4. Renderizar Asuntos Pendientes
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
  
  // Badge de categoría estático
  const cat = state.categories.find(c => c.id === person.category);
  if (cat) {
    DOM.peekPersonCategory.innerHTML = `<span class="badge ${cat.color}">${cat.name}</span>`;
  } else {
    DOM.peekPersonCategory.innerHTML = `<span class="badge grey">Sin categoría</span>`;
  }
  
  updateSidePeekUI();
  
  // Activar Side-Peek
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
  
  // Actualizar contadores
  DOM.prayersCount.textContent = `${activePrayers.length} ${activePrayers.length === 1 ? 'activa' : 'activas'}`;
  DOM.answeredCount.textContent = answeredPrayers.length;
  
  // Mostrar sección respondidas solo si hay
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
      
      // Listener de Checkbox
      li.querySelector('input').addEventListener('change', () => {
        togglePrayerStatus(state.selectedPerson.id, p.id, true);
      });
      
      // Listener de Delete
      const btnDel = li.querySelector('.btn-delete-prayer');
      btnDel.addEventListener('click', () => {
        deletePrayer(state.selectedPerson.id, p.id);
      });
      
      DOM.activePrayersList.appendChild(li);
    });
  }
  
  // Renderizar Respondidas (Archivo)
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
    
    // Listener de Checkbox (Desmarcar)
    li.querySelector('input').addEventListener('change', () => {
      togglePrayerStatus(state.selectedPerson.id, p.id, false);
    });
    
    // Listener de Delete
    const btnDel = li.querySelector('.btn-delete-prayer');
    btnDel.addEventListener('click', () => {
      deletePrayer(state.selectedPerson.id, p.id);
    });
    
    DOM.answeredPrayersList.appendChild(li);
  });
  
  applyModeVisibility();
}

// Actualizar lista de categorías en el selector de Side Peek
function updateCategorySelectOptions() {
  DOM.editPersonCategory.innerHTML = '';
  state.categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    DOM.editPersonCategory.appendChild(opt);
  });
}

// --- GESTIÓN DE ACCIONES DE FIRESTORE ---

// 1. Modificar estado de un asunto (Completado/Pendiente)
async function toggleMatterStatus(id, checked) {
  try {
    await updateDoc(doc(db, 'matters', id), {
      status: checked ? 'answered' : 'active'
    });
  } catch (error) {
    console.error("Error actualizando estado del asunto:", error);
  }
}

// 2. Modificar estado de una petición de oración (Respondida/Activa)
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

// 3. Añadir nueva petición de oración a una persona
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

// 4. Eliminar petición de oración de una persona
async function deletePrayer(personId, prayerId) {
  if (!state.selectedPerson) return;
  
  const prayers = (state.selectedPerson.prayers || []).filter(p => p.id !== prayerId);
  
  try {
    await updateDoc(doc(db, 'people', personId), { prayers });
  } catch (error) {
    console.error("Error eliminando petición:", error);
  }
}

// 5. Añadir nueva persona
async function addPerson() {
  if (!state.activeCategoryId) return;
  
  const name = prompt("Nombre de la persona por la que rezar:");
  if (!name || !name.trim()) return;
  
  try {
    const docRef = await addDoc(collection(db, 'people'), {
      name: name.trim(),
      category: state.activeCategoryId,
      prayers: [],
      createdAt: new Date()
    });
    
    // Abrir Side Peek inmediatamente de la persona creada
    const newPerson = {
      id: docRef.id,
      name: name.trim(),
      category: state.activeCategoryId,
      prayers: []
    };
    openSidePeek(newPerson);
  } catch (error) {
    console.error("Error añadiendo persona:", error);
  }
}

// 6. Guardar cambios en persona (Edición inline del side-peek)
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
    
    // Si cambió la categoría y ya no está en la activa, cerramos el panel
    if (newCat !== state.activeCategoryId) {
      closeSidePeek();
    }
  } catch (error) {
    console.error("Error guardando cambios del contacto:", error);
  }
}

// 7. Eliminar Persona
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

// 8. Crear / Editar Categoría
async function saveCategory() {
  const name = DOM.categoryNameInput.value.trim();
  const selectedDot = DOM.colorPickerGrid.querySelector('.color-dot.active');
  const color = selectedDot ? selectedDot.getAttribute('data-color') : 'pink';
  
  if (!name) return;
  
  try {
    if (editingCategoryId) {
      // Editar
      await updateDoc(doc(db, 'categories', editingCategoryId), { name, color });
    } else {
      // Crear nueva
      const docRef = await addDoc(collection(db, 'categories'), { name, color });
      state.activeCategoryId = docRef.id;
    }
    closeCategoryModal();
  } catch (error) {
    console.error("Error guardando categoría:", error);
  }
}

// 9. Eliminar Categoría
async function deleteCategory() {
  if (!editingCategoryId) return;
  
  const confirmDel = confirm("¿Deseas eliminar esta categoría? (Las personas asignadas seguirán existiendo pero no tendrán categoría).");
  if (!confirmDel) return;
  
  try {
    // 1. Quitar la categoría a los miembros
    const q = query(collection(db, 'people'), where('category', '==', editingCategoryId));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach((doc) => {
      batch.update(doc.ref, { category: 'sin-categoria' });
    });
    await batch.commit();
    
    // 2. Eliminar la categoría
    await deleteDoc(doc(db, 'categories', editingCategoryId));
    
    closeCategoryModal();
  } catch (error) {
    console.error("Error eliminando categoría:", error);
  }
}

// 10. Guardar Asunto
async function saveMatter() {
  const title = DOM.matterTitleInput.value.trim();
  const description = DOM.matterDescInput.value.trim();
  const category = DOM.matterCatInput.value.trim() || 'General';
  
  if (!title) return;
  
  try {
    if (editingMatterId) {
      // Editar
      await updateDoc(doc(db, 'matters', editingMatterId), {
        title,
        description,
        category
      });
    } else {
      // Crear
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

// 11. Eliminar Asunto
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

// --- MODALES (Show/Hide) ---

function openCategoryModal(catId = null) {
  editingCategoryId = catId;
  
  if (catId) {
    // Editar
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
    // Nuevo
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
    // Editar
    editingMatterId = matter.id;
    DOM.modalMatterTitle.textContent = "Editar Asunto";
    DOM.btnDeleteMatter.classList.remove('hidden');
    DOM.matterTitleInput.value = matter.title;
    DOM.matterDescInput.value = matter.description || '';
    DOM.matterCatInput.value = matter.category || '';
  } else {
    // Crear
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

function setActiveCategory(catId) {
  state.activeCategoryId = catId;
  
  // Cambiar selección en sidebar
  DOM.categoriesList.querySelectorAll('.menu-item').forEach((btn) => {
    if (btn.getAttribute('data-id') === catId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  renderActiveCategoryHeader();
  setupPeopleListener();
}

function setActiveTab(tab) {
  state.activeTab = tab;
  
  if (tab === 'people') {
    DOM.tabPeople.classList.add('active');
    DOM.tabMatters.classList.remove('active');
    DOM.peopleSection.classList.add('active');
    DOM.mattersSection.classList.remove('active');
    DOM.btnAddPerson.classList.remove('hidden');
    DOM.btnAddMatter.classList.add('hidden');
  } else {
    DOM.tabPeople.classList.remove('active');
    DOM.tabMatters.classList.add('active');
    DOM.peopleSection.classList.remove('active');
    DOM.mattersSection.classList.add('active');
    DOM.btnAddPerson.classList.add('hidden');
    DOM.btnAddMatter.classList.remove('hidden');
  }
  
  // Limpiar buscador
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
  
  // Actualizar también side-peek
  if (state.selectedPerson) {
    updateSidePeekUI();
  }
}

// Mostrar/Ocultar elementos según el modo
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

// --- MANEJADORES DE EVENTOS ---
function setupEventListeners() {
  // Banner de importación
  DOM.btnImportYes.addEventListener('click', importInitialData);
  DOM.btnImportNo.addEventListener('click', () => {
    DOM.importBanner.classList.add('hidden');
    // Inicializar vacía creando la categoría especiales por defecto
    addDoc(collection(db, 'categories'), { name: 'Especiales', color: 'pink' })
      .then(() => loadRealtimeData());
  });
  
  // Sidebar móvil
  DOM.sidebarToggle.addEventListener('click', () => {
    DOM.appSidebar.classList.toggle('active');
  });
  
  // Tabs
  DOM.tabPeople.addEventListener('click', () => setActiveTab('people'));
  DOM.tabMatters.addEventListener('click', () => setActiveTab('matters'));
  
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
  DOM.btnEmptyAddPerson.addEventListener('click', addPerson);
  
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
  
  // Color Picker para categoría
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
  
  // Escuchar inputs editables en side-peek (se guardan al perder foco)
  DOM.editPersonName.addEventListener('blur', savePersonChanges);
  DOM.editPersonCategory.addEventListener('change', savePersonChanges);
  DOM.btnDeletePerson.addEventListener('click', () => {
    if (state.selectedPerson) deletePerson(state.selectedPerson.id);
  });
}

// Iniciar app
init();
