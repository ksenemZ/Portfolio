let openPanel = null;

function togglePanel(side) {
    const left  = document.getElementById('leftPanel');
    const right  = document.getElementById('propertiesPanel');

    if (side === 'left') {
        const isOpen = !left.classList.contains('-translate-x-full');
        left.classList.toggle('-translate-x-full', isOpen);
        right.classList.add('translate-x-full');
        openPanel = isOpen ? null : 'left';
    }

    if (side === 'right') {
        const isOpen = !right.classList.contains('translate-x-full');
        right.classList.toggle('translate-x-full', isOpen);
        left.classList.add('-translate-x-full');
        openPanel = isOpen ? null : 'right';
    }
}

// При клике вне панелей – закрыть их
document.addEventListener('click', (e) => {
    const isLeft = document.getElementById('leftPanel').contains(e.target);
    const isRight = document.getElementById('propertiesPanel').contains(e.target);
    const isButton = e.target.closest('button');

    if (!isLeft && !isRight && !isButton && window.innerWidth < 1280) {
        document.getElementById('leftPanel').classList.add('-translate-x-full');
        document.getElementById('propertiesPanel').classList.add('translate-x-full');
        openPanel = null;
    }
});