//Скрипт обработчик страницы макета проекта.
//Включает создание, редактирование, удаление и сохранение элементов.

let selectedElement = null;
let draggedElement = null;
let dragTimer = null;
let isDragging = false;
let offsetX = 0;
let offsetY = 0;

//CSRF защита страницы
document.addEventListener('DOMContentLoaded', async () => {
    window.csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
    const projectId = window.location.pathname.split('/')[2];
    await loadCanvas(projectId);
});

//Функция добавления элемента на холст
function addElement(type) {
    const canvas = document.getElementById('canvas');
    let newEl;

    switch (type) {
        case 'text':
            newEl = document.createElement('div');
            newEl.textContent = 'Новый текст';
            newEl.style.fontSize = '18px';
            newEl.style.cursor = 'pointer';
            newEl.contentEditable = true;
            break;

        case 'divider':
            newEl = document.createElement('hr');
            newEl.style.width = canvas.width + 'px';
            break;

        case 'link':
            newEl = document.createElement('a');
            newEl.href = 'http://google.com/';
            newEl.textContent = 'Новая ссылка';
            newEl.target = '_blank';
            newEl.style.textDecoration = 'underline';
            newEl.style.color = '#3498db';
            newEl.style.fontSize = '18px';
            newEl.style.cursor = 'pointer';
            break;

        case 'polygon':
            newEl = document.createElement('pol');
            newEl.style.width = '100px';
            newEl.style.height = '100px';
            newEl.style.backgroundColor = '#3498db';
            newEl.style.clipPath = getPolygonClipPath(5);
            newEl.dataset.sides = 5;
            newEl.style.cursor = 'pointer';
            break;

        default:
            alert('Тип элемента не реализован');
            return;
    }

    newEl.style.position = 'absolute';
    newEl.style.left = '0px';
    newEl.style.top = '0px';

    newEl.classList.add('element');
    newEl.onclick = () => selectElement(newEl);
    canvas.appendChild(newEl);

    updateObjectTree();
    makeDraggable(newEl);
    selectElement(newEl);
}

//Функция для загрузки и добавления изображения на canvas//Функция для загрузки изображения в систему
document.getElementById('uploadForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const formData = new FormData(this);
    const projectId = window.location.pathname.split('/')[2];

    const res = await fetch(`/project/${projectId}/upload-image`, {
        method: 'POST',
        headers: {
            'CSRF-Token': csrfToken
        },
        body: formData
    });

    const data = await res.json();
    if (data.imageUrl) {
        addImageElement(data.imageUrl);
    } else {
        alert('Ошибка загрузки');
    }
});

//Функция для добавления изображения на canvas
function addImageElement(url) {
    const img = document.createElement('img');
    img.src = url;
    img.classList.add('max-w-full', 'rounded', 'absolute');
    img.style.cursor = 'pointer';
    img.style.width = '200px';
    img.style.overflow = 'hidden';
    img.onclick = () => selectElement(img);
    document.getElementById('canvas').appendChild(img);
    updateObjectTree();
    selectElement(img);
}

//Функция для выделения одного из элементов
//Позволяет настраивать параметры элемента
function selectElement(el) {
    selectedElement = el;
    const propsPanel = document.getElementById('propertiesContent');
    propsPanel.innerHTML = '';

    if (el.tagName === 'DIV') {
        propsPanel.innerHTML = `
            <label class="block text-sm mb-1 mt-3">Размер текста</label>
            <input type="number" value="${parseInt(el.style.fontSize)}" 
                   oninput="selectedElement.style.fontSize = this.value + 'px'" class="w-full bg-gray-200 pl-3 rounded-2xl">
                   
            <label class="block text-sm mb-1 mt-3">Высота</label>
            <input type="number" value="${parseInt(el.style.width)}" 
                   oninput="selectedElement.style.width = this.value + 'px'" class="w-full bg-gray-200 pl-3 rounded-2xl">
                   
            <label class="block text-sm mb-1 mt-3">Ширина</label>
            <input type="number" value="${parseInt(el.style.height)}" 
                   oninput="selectedElement.style.height = this.value + 'px'" class="w-full bg-gray-200 pl-3 rounded-2xl">
              
            <label class="block text-sm mb-1 mt-3">Цвет фона</label>
            <input type="color" value="${rgb2hex(getComputedStyle(el).backgroundColor)}" 
                   oninput="selectedElement.style.backgroundColor = this.value">
            
            <label class="block text-sm mb-1 mt-3">Цвет текста</label>
            <input type="color" value="${rgb2hex(getComputedStyle(el).color)}" 
                   oninput="selectedElement.style.color = this.value">
            
            <label class="block text-sm mb-1 mt-3">Начертание текста</label>
            <div class="flex gap-2 mt-1 flex-col items-start border-y border-y-gray-300">
                <button class="hover:bg-gray-100" onclick="toggleStyle('bold')">Жирный</button>
                <button class="hover:bg-gray-100" onclick="toggleStyle('italic')">Курсив</button>
                <button class="hover:bg-gray-100" onclick="toggleStyle('underline')">Подчеркнутый</button>
                <button class="hover:bg-gray-100" onclick="toggleStyle('line-through')">Зачеркнутый</button>
            </div>
    
            <label class="block text-sm mb-1 mt-3">Шрифт</label>
            <select class="w-full" onchange="selectedElement.style.fontFamily = this.value">
                <option value="Arial">Arial</option>
                <option value="Verdana">Verdana</option>
                <option value="Georgia">Georgia</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Tahoma">Tahoma</option>
            </select>
        `;
    } else if (el.tagName === 'A') {
        propsPanel.innerHTML = `
            <label>Текст ссылки</label>
            <input type="text" value="${el.textContent}" 
                   oninput="selectedElement.textContent = this.value">
                   
            <label class="block text-sm mb-1">Размер текста</label>
            <input type="number" value="${parseInt(el.style.fontSize)}" 
                   oninput="selectedElement.style.fontSize = this.value + 'px'" class="w-full bg-gray-200 pl-3 rounded-2xl">
                   
            <label class="block text-sm mb-1">Высота</label>
            <input type="number" value="${parseInt(el.style.width)}" 
                   oninput="selectedElement.style.width = this.value + 'px'" class="w-full bg-gray-200 pl-3 rounded-2xl">
                   
            <label class="block text-sm mb-1">Ширина</label>
            <input type="number" value="${parseInt(el.style.height)}" 
                   oninput="selectedElement.style.height = this.value + 'px'" class="w-full bg-gray-200 pl-3 rounded-2xl">

            <label class="mt-2 block">URL</label>
            <input type="text" id="urlInput" value="${el.href}">
            <button class="bg-green-500 text-white px-2 py-1 rounded flex w-max mt-2 hover:bg-green-600" onclick="validateURL()">Применить ссылку</button>

            <label class="mt-2 block">Цвет текста</label>
            <input type="color" value="${rgb2hex(getComputedStyle(el).color)}" 
                   oninput="selectedElement.style.color = this.value">

            <label class="mt-2 block">Размер текста</label>
            <input type="number" value="${parseInt(el.style.fontSize)}" 
                   oninput="selectedElement.style.fontSize = this.value + 'px'">

            <label class="block text-sm mb-1 mt-3">Начертание текста</label>
            <div class="flex gap-2 mt-1 flex-col items-start border-y border-y-gray-300">
                <button class="hover:bg-gray-100" onclick="toggleStyle('bold')">Жирный</button>
                <button class="hover:bg-gray-100" onclick="toggleStyle('italic')">Курсив</button>
                <button class="hover:bg-gray-100" onclick="toggleStyle('underline')">Подчеркнутый</button>
                <button class="hover:bg-gray-100" onclick="toggleStyle('line-through')">Зачеркнутый</button>
            </div>

            <label class="mt-2 block">Шрифт</label>
            <select onchange="selectedElement.style.fontFamily = this.value">
                <option value="Arial">Arial</option>
                <option value="Verdana">Verdana</option>
                <option value="Georgia">Georgia</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Tahoma">Tahoma</option>
            </select>
        `;
    } else if (el.tagName === 'IMG') {
        propsPanel.innerHTML = `
            <label class="block text-sm mb-1 mt-3">Ширина</label>
            <input type="number" value="${parseInt(el.style.width)}" 
                   oninput="selectedElement.style.width = this.value + 'px'" class="w-full bg-gray-200 pl-3 rounded-2xl">
        
            <label class="block text-sm mb-1 mt-3">Закругление</label>
            <input type="number" value="${parseInt(el.style.borderRadius) || '0px'}" 
                   oninput="selectedElement.style.borderRadius = this.value + 'px'" class="w-full bg-gray-200 pl-3 rounded-2xl">
        `;
    } else if (el.tagName === 'HR') {
        propsPanel.innerHTML = `
            <label class="block text-sm mb-1 mt-3">Ширина</label>
            <input type="number" value="${parseInt(el.style.width)}" 
                   oninput="selectedElement.style.width = this.value + 'px'" class="w-full bg-gray-200 pl-3 rounded-2xl">
        `;
    } else if (el.tagName === 'POL') {
        propsPanel.innerHTML = `
            <label class="block text-sm mb-1 mt-3">Количество сторон</label>
            <input type="number" value="${el.dataset.sides}" min="3" max="12"
                   oninput="updatePolygonSides(this.value)" class="w-full bg-gray-200 pl-3 rounded-2xl">
            
            <label class="block text-sm mb-1 mt-3">Цвет заливки</label>
            <input type="color" value="${rgb2hex(getComputedStyle(el).backgroundColor)}" 
                   oninput="selectedElement.style.backgroundColor = this.value" class="w-full bg-gray-200 pl-3 rounded-2xl">
            
            <label class="block text-sm mb-1 mt-3">Высота</label>
            <input type="text" value="${selectedElement.style.width}" 
                   oninput="selectedElement.style.width = this.value" class="w-full bg-gray-200 pl-3 rounded-2xl">

            <label class="block text-sm mb-1 mt-3">Ширина</label>
            <input type="text" value="${selectedElement.style.height}" 
                   oninput="selectedElement.style.height = this.value" class="w-full bg-gray-200 pl-3 rounded-2xl">
        `;
    }

    updatePropsPanel(el)
}

//Функция для отрисовки панели параметров элементов
function updatePropsPanel(el) {
    selectedElement = el;
    const propsPanel = document.getElementById('propertiesContent');
    const canvas = document.getElementById('canvas');
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;

    const left = (parseFloat(el.offsetLeft) / canvasWidth) * 100;
    const top = (parseFloat(el.offsetTop) / canvasHeight) * 100;

    if (el.id === 'canvas') {
        propsPanel.innerHTML = `
          <div class="mb-5">
            <label class="block text-sm mb-1">Цвет фона</label>
            <input type="color" id="backgroundColor" value="${rgb2hex(getComputedStyle(el).backgroundColor)}" class="w-full">
          </div>
          <div class="mb-5">
            <label class="block text-sm mb-1">Фон-картинка (URL)</label>
            <input type="text" id="backgroundImage" placeholder="https://example.com/image.png" class="w-full bg-gray-200 pl-3 rounded-2xl">
            <button onclick="resetBG(selectedElement)">Очистить фон</button>
          </div>
          <div class="mb-5">
            <label class="block text-sm mb-1">Ширина (px)</label>
            <input type="number" id="canvasWidthInput" value="${canvasWidth}" class="w-full bg-gray-200 pl-3 rounded-2xl" />
          </div>
          <div class="mb-5">
            <label class="block text-sm mb-1">Высота (px)</label>
            <input type="number" id="canvasHeightInput" value="${canvasHeight}" class="w-full bg-gray-200 pl-3 rounded-2xl" />
          </div>
        `;

        document.getElementById('backgroundColor').addEventListener('input', (e) => {
            el.style.backgroundColor = e.target.value;
        });

        document.getElementById('backgroundImage').addEventListener('change', (e) => {
            const url = e.target.value.trim();
            if (!url) {
                el.style.backgroundImage = '';
                return;
            }

            const img = new Image();

            img.src = url;
            img.onload = () => {
                el.style.backgroundImage = `url(${url})`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
            };

            img.onerror = () => {
                el.style.backgroundImage = '';
                alert('Ошибка загрузки! Проверьте валидность ссылки.');
            };
        });

        document.getElementById('canvasWidthInput').addEventListener('input', (e) => {
            canvas.style.width = `${e.target.value}px`;
        });

        document.getElementById('canvasHeightInput').addEventListener('input', (e) => {
            canvas.style.height = `${e.target.value}px`;
        });

    } else {
        propsPanel.innerHTML += `
            <label class="block text-sm mb-1 mt-3">Вращение</label>
            <input type="number" value="${parseInt(el.style.rotate)}" min="-360" max="360"
                   oninput="selectedElement.style.rotate = this.value + 'deg';
                   if(Number(this.value) > Number(this.max)) this.value = this.max;
                   if(Number(this.value) < Number(this.min)) this.value = this.min"
                   class="w-full bg-gray-200 pl-3 rounded-2xl">
                   
            <label class="block text-sm mb-1 mt-3">Z-Index</label>
            <input type="number" value="${parseInt(el.style.zIndex)}" min="0"
                oninput="selectedElement.style.zIndex = this.value"
                class="w-full bg-gray-200 pl-3 rounded-2xl">
            <label class="block text-sm mb-1 mt-3">Позиция X (%):
              <input type="number" id="posX" value="${left.toFixed(1)}" class="w-full bg-gray-200 p-2 rounded-2xl" step="0.1" />
            </label>
            <label class="block text-sm mb-1 mt-3">Позиция Y (%):
              <input type="number" id="posY" value="${top.toFixed(1)}" class="w-full bg-gray-200 p-2 rounded-2xl" step="0.1" />
            </label>
            <label class="block text-sm mb-1 mt-3">Имя элемента</label>
            <input type="text" value="${el.dataset.uid}" 
                   oninput="selectedElement.dataset.uid = this.value; updateObjectTree();" class="w-full bg-gray-200 p-2 rounded-2xl">
            <button onclick="removeElement(selectedElement)" class="mt-4 mb-10 bg-red-500 text-white px-2 py-1 rounded">
              Удалить элемент
            </button>
  `;
        document.getElementById('posX').addEventListener('input', updateElementPosition);
        document.getElementById('posY').addEventListener('input', updateElementPosition);
    }
}

//Функция для отрисовки дерева элементов
function updateObjectTree() {
    const propsPanel = document.getElementById('propertiesContent');
    const tree = document.getElementById('objectTree');
    tree.innerHTML = '';

    const elements = document.querySelectorAll('#canvas > *');
    elements.forEach((el, index) => {
        const id = el.dataset.uid || `element-${index + 1}`;
        el.dataset.uid = id;

        const li = document.createElement('li');
        li.className = 'cursor-pointer hover:bg-gray-100 p-1 rounded flex items-center justify-between';
        li.innerHTML = `
      <span class="truncate max-w-[80%]">${el.dataset.name || id}</span>
    `;
        li.addEventListener('click', () => {
            propsPanel.innerHTML = '';
            selectElement(el);
        });

        tree.appendChild(li);
    });
}

document.getElementById('canvas').addEventListener('click', (e) => {
    if (e.target.id === 'canvas') {
        selectedElement = document.getElementById('canvas');
        updatePropsPanel(selectedElement);
    }
});

//Проверка валидности ссылки
function validateURL() {
    const input = document.getElementById('urlInput');
    const value = input.value.trim();

    try {
        const url = new URL(value);

        if (url.protocol === 'http:' || url.protocol === 'https:') {
            selectedElement.href = value;
        } else {
            selectedElement.href = '';
            alert('Ошибка! Проверьте правильность ссылки');
        }
    } catch (e) {
        selectedElement.href = '';
        alert('Ошибка! Проверьте валидность ссылки');
    }
}

function rgb2hex(rgb) {
    const result = rgb.match(/\d+/g);
    return result ? "#" + result.map(x => (+x).toString(16).padStart(2, "0")).join("") : "#ffffff";
}

function resetBG(el) {
    el.style.backgroundColor = 'white';
    el.style.backgroundImage = '';
}

//Функция для настройки параметра стиля шрифта у элемента
function toggleStyle(style) {
    if (!selectedElement) return;
    const current = selectedElement.style;

    switch (style) {
        case 'bold':
            current.fontWeight = current.fontWeight === 'bold' ? 'normal' : 'bold';
            break;
        case 'italic':
            current.fontStyle = current.fontStyle === 'italic' ? 'normal' : 'italic';
            break;
        case 'underline':
            if (current.textDecoration.includes('underline')) {
                current.textDecoration = current.textDecoration.replace('underline', '').trim();
            } else {
                current.textDecoration = (current.textDecoration + ' underline').trim();
            }
            break;
        case 'line-through':
            if (current.textDecoration.includes('line-through')) {
                current.textDecoration = current.textDecoration.replace('line-through', '').trim();
            } else {
                current.textDecoration = (current.textDecoration + ' line-through').trim();
            }
            break;
    }
}

//Вспомогательные функции для отрисовки полигона в реальном времени
function getPolygonClipPath(sides) {
    const angle = 360 / sides;
    let points = "";
    for (let i = 0; i < sides; i++) {
        const x = 50 + 50 * Math.cos((angle * i - 90) * Math.PI / 180);
        const y = 50 + 50 * Math.sin((angle * i - 90) * Math.PI / 180);
        points += `${x}% ${y}%, `;
    }
    return `polygon(${points.slice(0, -2)})`;
}
function updatePolygonSides(sides) {
    sides = Math.max(3, Math.min(12, +sides));
    selectedElement.dataset.sides = sides;
    selectedElement.style.clipPath = getPolygonClipPath(sides);
}

//функция для изменения позиции элемента при настройке через панель
function updateElementPosition() {
    if (!selectedElement) return;

    const canvas = document.getElementById('canvas');
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;

    let inputX = parseFloat(document.getElementById('posX').value);
    let inputY = parseFloat(document.getElementById('posY').value);

    const maxX = 100 - (selectedElement.offsetWidth / canvasWidth) * 100;
    const maxY = 100 - (selectedElement.offsetHeight / canvasHeight) * 100;

    inputX = Math.max(0, Math.min(inputX, maxX));
    inputY = Math.max(0, Math.min(inputY, maxY));

    selectedElement.style.left = `${inputX}%`;
    selectedElement.style.top = `${inputY}%`;

    document.getElementById('posX').value = inputX.toFixed(1);
    document.getElementById('posY').value = inputY.toFixed(1);
}

//Сделать Drag & drop элемента
function makeDraggable(el) {
    el.addEventListener('mousedown', (e) => startInteraction(e, el, false));
    el.addEventListener('touchstart', (e) => startInteraction(e, el, true), { passive: false });
}

//Просчет времени для корректного срабатывания клика и перетаскивания
function startInteraction(e, el, isTouch) {
    if (isTouch) e.preventDefault();
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    offsetX = clientX - el.getBoundingClientRect().left;
    offsetY = clientY - el.getBoundingClientRect().top;

    dragTimer = setTimeout(() => {
        isDragging = true;
        draggedElement = el;

        if (isTouch) {
            document.addEventListener('touchmove', onDragTouch, { passive: false });
            document.addEventListener('touchend', endInteractionTouch);
        } else {
            document.addEventListener('mousemove', onDragMouse);
            document.addEventListener('mouseup', endInteractionMouse);
        }
    }, 250);

    if (isTouch) {
        document.addEventListener('touchend', (e) => handleTap(e, el), { once: true });
    } else {
        document.addEventListener('mouseup', (e) => handleTap(e, el), { once: true });
    }
}

//Если не перетаскиваем, то инициируем "псевдоклик"
function handleTap(e, el) {
    if (!isDragging) {
        clearTimeout(dragTimer);
        selectElement(el);
    }
}

//Калькуляция перемещения
function dragElementTo(clientX, clientY) {
    if (!draggedElement) return;

    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();

    let left = clientX - canvasRect.left - offsetX;
    let top = clientY - canvasRect.top - offsetY;

    left = Math.max(0, Math.min(left, canvas.offsetWidth - draggedElement.offsetWidth));
    top = Math.max(0, Math.min(top, canvas.offsetHeight - draggedElement.offsetHeight));

    draggedElement.style.left = `${left}px`;
    draggedElement.style.top = `${top}px`;
}

//Обработчики для мыши и пальца
function onDragMouse(e) {
    dragElementTo(e.clientX, e.clientY);
}
function onDragTouch(e) {
    e.preventDefault();
    dragElementTo(e.touches[0].clientX, e.touches[0].clientY);
}
function endInteractionMouse() {
    if (isDragging) {
        document.removeEventListener('mousemove', onDragMouse);
        document.removeEventListener('mouseup', endInteractionMouse);
    }
    cleanup();
}
function endInteractionTouch() {
    if (isDragging) {
        document.removeEventListener('touchmove', onDragTouch);
        document.removeEventListener('touchend', endInteractionTouch);
    }
    cleanup();
}

//Сброс перетаскивания
function cleanup() {
    clearTimeout(dragTimer);
    draggedElement = null;
    isDragging = false;
}

//Удаление элемента через панель
function removeElement(el) {
    const propsPanel = document.getElementById('propertiesContent');
    if (el.tagName === 'IMG' && el.src.includes('/uploads/')) {
        const filePath = new URL(el.src).pathname;
        fetch('/delete-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json',
                       'CSRF-Token': window.csrfToken},
            body: JSON.stringify({ path: filePath })
        });
    }
    el.remove();
    updateObjectTree();
    propsPanel.innerHTML = '';
    selectedElement = null;
}

//удаление элемента по нажатию
document.addEventListener('keydown', function (e) {
    if (e.key === 'Delete' && selectedElement) {
        removeElement(selectedElement);
    }
});

//Функция записи canvas и элементов с их настройками в массив
function collectCanvasData() {
    const canvas = document.getElementById('canvas');
    const canvasStyles = getComputedStyle(canvas);

    const elements = Array.from(canvas.children).map(child => {
        const style = getComputedStyle(child);
        return {
            tag: child.tagName.toLowerCase(),
            text: child.textContent,
            src: child.tagName === 'IMG' ? child.src : null,
            href: child.tagName === 'A' ? child.href : null,
            styles: {
                left: child.style.left,
                top: child.style.top,
                width: child.style.width,
                height: child.style.height,
                color: style.color,
                backgroundColor: style.backgroundColor,
                fontSize: style.fontSize,
                fontFamily: style.fontFamily,
                fontWeight: style.fontWeight,
                fontStyle: style.fontStyle,
                textDecoration: style.textDecoration,
                borderRadius: style.borderRadius,
                clipPath: child.style.clipPath,
                rotate: child.style.rotate,
                zIndex: child.style.zIndex,
                uid: child.dataset.uid,
            },
            dataset: {...child.dataset}
        };
    });

    return {
        backgroundColor: canvasStyles.backgroundColor,
        backgroundImage: canvasStyles.backgroundImage,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        width: canvas.offsetWidth,
        height: canvas.offsetHeight,
        elements
    };
}

//Функция для сборки массива canvas в JSON-подобную структуру layout
async function saveCanvas() {
    const data = collectCanvasData();
    const projectId = window.location.pathname.split('/')[2];
    const layoutData = JSON.stringify(data);

    await fetch(`/api/project/${projectId}/layout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'CSRF-Token': window.csrfToken
        },
        body: JSON.stringify({ layout: layoutData }),
    });
}

//Функция для загрузки canvas из lauout
async function loadCanvas() {
    const projectId = window.location.pathname.split('/')[2]; // Извлекаем ID проекта

    try {
        const res = await fetch(`/api/project/${projectId}/layout`);

        if (!res.ok) {
            throw new Error('Ошибка загрузки проекта');
        }

        const data = await res.json();

        if (data && data.layout) {
            let parsedLayout;

            if (typeof data.layout === 'string') {
                try {
                    parsedLayout = JSON.parse(data.layout);
                } catch (e) {
                    console.error('Ошибка парсинга JSON:', e);
                    return;
                }
            } else {
                parsedLayout = data.layout;
            }
            if (parsedLayout && parsedLayout.elements && Array.isArray(parsedLayout.elements)) {
                let objects = parsedLayout.elements;

                const canvas = document.getElementById('canvas');
                canvas.innerHTML = '';

                canvas.style.backgroundColor = parsedLayout.backgroundColor || 'white';
                canvas.style.backgroundImage = parsedLayout.backgroundImage || 'none';
                canvas.style.minWidth = (parsedLayout.width || 800) + 'px';
                canvas.style.minHeight = (parsedLayout.height || 600) + 'px';
                canvas.style.backgroundSize = parsedLayout.backgroundSize || 'cover';
                canvas.style.backgroundRepeat = parsedLayout.backgroundRepeat || 'no-repeat';
                canvas.style.backgroundPosition = parsedLayout.backgroundPosition || 'center';

                objects.forEach(el => {
                    let element;

                    switch (el.tag) {
                        case 'div':
                            element = document.createElement('div');
                            element.style.position = 'absolute'; // Ставим элемент на холст
                            element.style.left = el.styles.left || '0px'; // Позиция X
                            element.style.top = el.styles.top || '0px';  // Позиция Y
                            element.style.width = el.styles.width || '100px';
                            element.style.height = el.styles.height || '100px';
                            element.style.fontSize = el.styles.fontSize || '16px';
                            element.style.textDecoration = el.styles.textDecoration;
                            element.style.fontWeight = el.styles.fontWeight;
                            element.style.fontFamily = el.styles.fontFamily;
                            element.style.color = el.styles.color || 'black';
                            element.style.backgroundColor = el.styles.backgroundColor || 'transparent';
                            element.style.rotate = el.styles.rotate || '0deg';
                            element.cursor = 'pointer';
                            element.textContent = el.text || '';
                            element.style.zIndex = el.styles.zIndex || '0';
                            element.dataset.uid = el.dataset.uid;
                            element.style.fontStyle = el.styles.fontStyle;
                            element.contentEditable = true;
                            break;

                        case 'hr':
                            element = document.createElement('hr');
                            element.style.position = 'absolute';
                            element.style.left = el.styles.left || '0px';
                            element.style.top = el.styles.top || '0px';
                            element.style.width = el.styles.width || '100px';
                            element.cursor = 'pointer';
                            element.dataset.uid = el.dataset.uid;
                            break;

                        case 'img':
                            element = document.createElement('img');
                            element.src = el.src || '';
                            element.style.position = 'absolute';
                            element.style.left = el.styles.left || '0px';
                            element.style.top = el.styles.top || '0px';
                            element.style.width = el.styles.width || '100%';
                            element.style.height = el.styles.height || 'auto';
                            element.style.borderRadius = el.styles.borderRadius || '0px';
                            element.style.rotate = el.styles.rotate || '0deg';
                            element.style.zIndex = el.styles.zIndex || '0';
                            element.dataset.uid = el.dataset.uid;
                            break;

                        case 'pol':
                            element = document.createElement('pol');
                            element.style.position = 'absolute';
                            element.style.left = el.styles.left || '0px';
                            element.style.top = el.styles.top || '0px';
                            element.style.width = el.styles.width || '100px';
                            element.style.height = el.styles.height || '100px';
                            element.style.backgroundColor = el.styles.backgroundColor || '#3498db';
                            element.style.clipPath = el.styles.clipPath || 'none';
                            element.dataset.sides = el.dataset.sides || 5;
                            element.style.rotate = el.styles.rotate || '0deg';
                            element.style.cursor = 'pointer';
                            element.style.zIndex = el.styles.zIndex || '0';
                            element.dataset.uid = el.dataset.uid;
                            break;

                        case 'a':
                            element = document.createElement('a');
                            element.href = el.href || '#';
                            element.style.position = 'absolute';
                            element.style.left = el.styles.left || '0px';
                            element.style.top = el.styles.top || '0px';
                            element.style.fontSize = el.styles.fontSize || '16px';
                            element.style.textDecoration = el.styles.textDecoration;
                            element.style.fontWeight = el.styles.fontWeight;
                            element.style.fontFamily = el.styles.fontFamily;
                            element.style.color = el.styles.color || 'black';
                            element.style.rotate = el.styles.rotate || '0deg';
                            element.target = el.target || '_blank';
                            element.cursor = 'pointer';
                            element.textContent = el.text || '';
                            element.style.zIndex = el.styles.zIndex || '0';
                            element.dataset.uid = el.dataset.uid;
                            element.contentEditable = true;
                            break;

                        default:
                            console.error('Неизвестный тег:', el.tag);
                            return;
                    }

                    const canvas = document.getElementById('canvas');

                    element.onclick = () => selectElement(element);
                    canvas.appendChild(element);

                    updateObjectTree();
                    makeDraggable(element);
                    selectElement(element);
                });
            } else {
                console.error('Ошибка: layout.elements не является массивом');
            }
        } else {
            console.error('Ошибка: Неверная структура данных layout');
        }
    } catch (error) {
        console.error('Ошибка загрузки холста:', error);
    }
}