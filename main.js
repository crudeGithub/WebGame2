// ==========================================
// AUDIO SYSTEM (Procedural)
// ==========================================
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playSound(type, freq = 440, vol = 0.1) {
    if (audioCtx.state === 'suspended') return;

    // Clamp freq to avoid errors
    freq = Math.min(Math.max(freq, 20), 20000);

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'place') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.2, now + 0.15);
        gainNode.gain.setValueAtTime(vol, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'sort') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.15);
        gainNode.gain.setValueAtTime(vol, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'merge') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.25, now + 0.3);
        gainNode.gain.setValueAtTime(vol, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
}

window.addEventListener('pointerdown', () => {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}, { once: true });

// ==========================================
// GAME CONSTANTS & STATE
// ==========================================
const HEX_RADIUS = 2;
const HEX_HEIGHT = 0.5;
const HEX_SPACING = 0.1;
// distance between centers of hexagons. 
// A hex with radius R has width W = 2 * R, and horiz dist = sqrt(3) * R
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const HEX_Y_OFFSET = HEX_RADIUS * 1.5; // vertical distance between rows

const COLORS = [
    0x00f0ff, // Bright Cyan (from first ref)
    0xd52bff, // Bright Purple (from first ref)
    0x39e639, // Bright Green (from first ref)
    0xff2a2a, // Red (from second ref)
    0xffaa00, // Orange
    0x0088ff  // Blue
];

let score = 0;
let level = 1;
let progress = 0;
let targetProgress = 100;

// Board State
const board = new Map(); // key: "q,r", value: { tileMesh, stackInfo[] }

// ==========================================
// THREE.JS SETUP
// ==========================================
const scene = new THREE.Scene();
// Background handles by CSS now
scene.fog = new THREE.FogExp2(0x76d4f9, 0.015);

// Isometric Orthographic Camera
const aspect = window.innerWidth / window.innerHeight;
const d = 20;
const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
camera.position.set(0, 60, 15); // Steeper 75+ degree top-down view instead of 45
camera.lookAt(scene.position);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ==========================================
// LIGHTING
// ==========================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.85); // Brighter ambient
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.4); // Softer directional
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.001;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.2); // White fill instead of blue
fillLight.position.set(-10, 10, -10);
scene.add(fillLight);

// Hex geometry for base board
const hexGeometry = new THREE.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, HEX_HEIGHT, 6);
hexGeometry.rotateY(Math.PI / 6);

// Base Tile Material (Light Blue-Grey)
const tileMaterial = new THREE.MeshStandardMaterial({
    color: 0xcadeed, // Light blueish-grey from the reference board
    roughness: 0.6,
    metalness: 0.1,
});

// Hex geometry for pieces (slightly smaller radius for stacking gaps)
const pieceGeometry = new THREE.CylinderGeometry(HEX_RADIUS * 0.95, HEX_RADIUS * 0.95, HEX_HEIGHT * 0.8, 6);
pieceGeometry.rotateY(Math.PI / 6);

// ==========================================
// BOARD GENERATION
// ==========================================
// Axial coordinates (q, r)
function createBoard(rings) {
    for (let q = -rings; q <= rings; q++) {
        let r1 = Math.max(-rings, -q - rings);
        let r2 = Math.min(rings, -q + rings);
        for (let r = r1; r <= r2; r++) {
            createTile(q, r);
        }
    }
}

function createTile(q, r) {
    // Convert axial to world coordinates
    // x = sqrt(3) * q + sqrt(3)/2 * r
    // z = 3/2 * r
    const x = (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) * (HEX_RADIUS + HEX_SPACING);
    const z = (3 / 2 * r) * (HEX_RADIUS + HEX_SPACING);

    const tile = new THREE.Mesh(hexGeometry, tileMaterial);
    tile.position.set(x, 0, z);
    tile.receiveShadow = true;

    // Slight entry animation
    tile.position.y = -10;
    gsap.to(tile.position, {
        y: 0,
        duration: 0.8,
        ease: "back.out(1.5)",
        delay: (Math.abs(q) + Math.abs(r)) * 0.1
    });

    scene.add(tile);
    board.set(`${q},${r}`, {
        q, r,
        mesh: tile,
        x, z,
        stack: [],
        isSorting: false,
        pending: false
    });
}

createBoard(2); // Create a radius 2 hexagon board

// ==========================================
// RENDER LOOP & RESIZE
// ==========================================
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -d * aspect;
    camera.right = d * aspect;
    camera.top = d;
    camera.bottom = -d;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// GAMEPLAY LOGIC (SPAWN, DRAG, DROP)
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let draggedStackId = null; // 0, 1, or 2
let draggedGroup = null;
let originalPosition = new THREE.Vector3();

// We will store the 3 current options here
const options = [null, null, null];
// We position the slots in world space at the bottom front
const SLOT_POSITIONS = [
    new THREE.Vector3(-10, 0.5, 12),
    new THREE.Vector3(0, 0.5, 12),
    new THREE.Vector3(10, 0.5, 12)
];

function generateRandomStack(size = 5) {
    const stack = [];
    const numColors = Math.floor(Math.random() * 3) + 1; // 1 to 3 distinct colors in a stack
    const stackColors = [];
    for (let i = 0; i < numColors; i++) {
        stackColors.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }

    let currentColor = stackColors[0];
    for (let i = 0; i < size; i++) {
        // Occasionally switch color based on available colors
        if (Math.random() < 0.3) {
            currentColor = stackColors[Math.floor(Math.random() * stackColors.length)];
        }
        stack.push(currentColor);
    }
    return stack;
}

function spawnOptions() {
    for (let i = 0; i < 3; i++) {
        if (!options[i]) {
            const group = new THREE.Group();
            const stackColors = generateRandomStack(Math.floor(Math.random() * 4) + 3); // 3 to 6 pieces

            // Render the stack
            stackColors.forEach((color, index) => {
                const mat = new THREE.MeshPhysicalMaterial({
                    color: color,
                    roughness: 0.3,
                    metalness: 0.1,
                    clearcoat: 0.5,
                    clearcoatRoughness: 0.2
                });
                const piece = new THREE.Mesh(pieceGeometry, mat);
                piece.position.y = index * HEX_HEIGHT;
                piece.castShadow = true;
                piece.receiveShadow = true;

                // Darker bottom edge for depth (faux shadow)
                const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
                const shadowGeo = new THREE.CylinderGeometry(HEX_RADIUS * 0.96, HEX_RADIUS * 0.96, HEX_HEIGHT * 0.2, 6);
                shadowGeo.rotateY(Math.PI / 6);
                const dropShadow = new THREE.Mesh(shadowGeo, shadowMat);
                dropShadow.position.y = -HEX_HEIGHT * 0.4;
                piece.add(dropShadow);

                // Add an edge helper for better definition
                const edges = new THREE.EdgesGeometry(pieceGeometry);
                const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 }));
                piece.add(line);

                group.add(piece);
            });

            group.position.copy(SLOT_POSITIONS[i]);
            group.position.y = -10; // start below
            group.userData = { id: i, colors: stackColors };
            scene.add(group);
            options[i] = group;

            // animate in
            gsap.to(group.position, {
                y: 0.5, // slightly above ground
                duration: 0.5,
                delay: i * 0.1,
                ease: "back.out(1.5)"
            });
        }
    }
}

spawnOptions();

// -- Mouse/Touch Interaction --
window.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);

function getIntersects(event) {
    let clientX = event.clientX;
    let clientY = event.clientY;

    // Fallback for raw touch events if they somehow slip through without clientX
    if (clientX === undefined && event.changedTouches && event.changedTouches.length > 0) {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
    }

    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
}

function onPointerDown(event) {
    if (event.target.tagName !== 'CANVAS') return;
    getIntersects(event);

    // Check if we clicked on an option
    for (let i = 0; i < 3; i++) {
        if (options[i]) {
            const intersects = raycaster.intersectObject(options[i], true);
            if (intersects.length > 0) {
                draggedStackId = i;
                draggedGroup = options[i];
                originalPosition.copy(draggedGroup.position);

                // Lift it up clearly
                gsap.to(draggedGroup.position, {
                    y: 2,
                    duration: 0.2
                });
                document.body.style.cursor = 'grabbing';
                break;
            }
        }
    }
}

function onPointerMove(event) {
    if (draggedGroup) {
        getIntersects(event);
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane, intersectPoint);
        if (intersectPoint) {
            draggedGroup.position.x = intersectPoint.x;
            draggedGroup.position.z = intersectPoint.z;
        }

        // Highlight grid tile if hovering
        let hoverTarget = null;
        const intersects = raycaster.intersectObjects(Array.from(board.values()).map(b => b.mesh));
        if (intersects.length > 0) {
            hoverTarget = intersects[0].object;
        }

        board.forEach(cell => {
            if (cell.mesh === hoverTarget && cell.stack.length === 0) {
                cell.mesh.material.color.setHex(0xe6f2ff); // Lighter highlight
            } else {
                cell.mesh.material.color.setHex(0xcadeed); // Normal light blue-grey
            }
        });
    }
}

function onPointerUp(event) {
    document.body.style.cursor = 'default';
    if (draggedGroup) {
        // Reset all highlights
        board.forEach(cell => cell.mesh.material.color.setHex(0xcadeed));

        getIntersects(event);
        const intersects = raycaster.intersectObjects(Array.from(board.values()).map(b => b.mesh));
        let placed = false;

        if (intersects.length > 0) {
            const targetMesh = intersects[0].object;
            // Find which cell this mesh belongs to
            let targetCell = null;
            for (let [key, cell] of board.entries()) {
                if (cell.mesh === targetMesh) {
                    targetCell = cell;
                    break;
                }
            }

            if (targetCell && targetCell.stack.length === 0 && !targetCell.pending) {
                // Place it here!
                placed = true;
                targetCell.pending = true; // Block other tiles from being placed here while animating

                const finalPos = new THREE.Vector3(targetCell.x, HEX_HEIGHT, targetCell.z);

                const pieces = [...draggedGroup.children];
                const dropAnimations = [];

                // Store references before nullifying to allow immediate next interaction
                const currentDraggedId = draggedStackId;
                const currentDraggedGroup = draggedGroup;

                // Hide the original draggedGroup right away to prevent double rendering visually,
                // but keep data intact until animations finish.
                currentDraggedGroup.visible = false;
                draggedStackId = null;
                draggedGroup = null;

                pieces.forEach((piece, index) => {
                    scene.attach(piece); // Move to world space for animation
                    const targetY = index * HEX_HEIGHT;

                    dropAnimations.push(new Promise(resolve => {
                        gsap.to(piece.position, {
                            x: finalPos.x,
                            z: finalPos.z,
                            duration: 0.3,
                            delay: index * 0.05,
                            ease: "power2.inOut",
                            onStart: () => playSound('place', 300 + index * 40, 0.1)
                        });
                        gsap.to(piece.position, {
                            y: finalPos.y + targetY,
                            duration: 0.3,
                            delay: index * 0.05,
                            ease: "sine.out",
                            onComplete: resolve
                        });
                    }));
                });

                Promise.all(dropAnimations).then(() => {
                    // Update Board Logic
                    targetCell.stack = currentDraggedGroup.userData.colors.map(c => ({ color: c }));
                    targetCell.pending = false; // Release lock

                    // Clean up scene
                    pieces.forEach(p => scene.remove(p));
                    scene.remove(currentDraggedGroup);

                    // Rebuild stack on target cell officially
                    rebuildCellStack(targetCell);

                    options[currentDraggedId] = null;

                    if (options.every(o => o === null)) {
                        spawnOptions();
                    }

                    triggerSort(targetCell);
                });
            }
        }

        if (!placed) {
            const groupToReturn = draggedGroup;
            draggedGroup = null;
            draggedStackId = null;

            // Return to slot
            gsap.to(groupToReturn.position, {
                x: originalPosition.x,
                y: originalPosition.y,
                z: originalPosition.z,
                duration: 0.3,
                ease: "power2.out"
            });
        }
    }
}

function rebuildCellStack(cell) {
    // Clear old meshes if any
    if (cell.meshGroup) {
        scene.remove(cell.meshGroup);
    }
    cell.meshGroup = new THREE.Group();
    cell.meshGroup.position.set(cell.x, HEX_HEIGHT, cell.z);

    cell.stack.forEach((item, index) => {
        if (!item.mesh) {
            const mat = new THREE.MeshPhysicalMaterial({
                color: item.color,
                roughness: 0.3,
                metalness: 0.1,
                clearcoat: 0.5,
                clearcoatRoughness: 0.2
            });
            const piece = new THREE.Mesh(pieceGeometry, mat);
            piece.castShadow = true;
            piece.receiveShadow = true;

            const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
            const shadowGeo = new THREE.CylinderGeometry(HEX_RADIUS * 0.96, HEX_RADIUS * 0.96, HEX_HEIGHT * 0.2, 6);
            shadowGeo.rotateY(Math.PI / 6);
            const dropShadow = new THREE.Mesh(shadowGeo, shadowMat);
            dropShadow.position.y = -HEX_HEIGHT * 0.4;
            piece.add(dropShadow);

            const edges = new THREE.EdgesGeometry(pieceGeometry);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 }));
            piece.add(line);
            item.mesh = piece;
        }

        // Ensure local transform is clean
        item.mesh.position.set(0, index * HEX_HEIGHT, 0);
        item.mesh.rotation.set(0, 0, 0);
        item.mesh.scale.set(1, 1, 1);

        cell.meshGroup.add(item.mesh);
    });
    scene.add(cell.meshGroup);
}

// ==========================================
// GAMEPLAY LOGIC (SORT, MERGE, SCORE)
// ==========================================

function getNeighbors(cell) {
    const directions = [
        [+1, 0], [+1, -1], [0, -1],
        [-1, 0], [-1, +1], [0, +1]
    ];
    const neighbors = [];
    for (let [dq, dr] of directions) {
        const key = `${cell.q + dq},${cell.r + dr}`;
        if (board.has(key)) neighbors.push(board.get(key));
    }
    return neighbors;
}

function updateScore(points) {
    score += points;
    document.getElementById('score').innerText = score;
    progress += points;
    if (progress >= targetProgress) {
        progress = targetProgress;
        levelComplete();
    }
    document.getElementById('progress').style.width = Math.min((progress / targetProgress * 100), 100) + '%';
}

function levelComplete() {
    document.getElementById('game-over').classList.remove('hidden');
    document.getElementById('win-level').innerText = level;
    createConfetti();
}

document.getElementById('next-level-btn').addEventListener('click', () => {
    level++;
    document.getElementById('level').innerText = level;
    targetProgress = 100 * level;
    progress = 0;
    document.getElementById('progress').style.width = '0%';
    document.getElementById('game-over').classList.add('hidden');

    // clear board
    board.forEach(cell => {
        if (cell.meshGroup) {
            scene.remove(cell.meshGroup);
            cell.meshGroup = null;
        }
        cell.stack = [];
    });
});

function createConfetti() {
    const colors = ['#00f0ff', '#d52bff', '#39e639', '#ffaa00', '#ff2a2a'];
    for (let i = 0; i < 80; i++) {
        const conf = document.createElement('div');
        conf.style.position = 'absolute';
        conf.style.width = '12px';
        conf.style.height = '12px';
        conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        conf.style.left = '50%';
        conf.style.top = '50%';
        conf.style.zIndex = '1000';
        conf.style.pointerEvents = 'none';

        let shape = Math.random();
        if (shape < 0.3) {
            conf.style.borderRadius = '50%';
        } else if (shape < 0.6) {
            conf.style.clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
        }

        document.body.appendChild(conf);

        const angle = Math.random() * Math.PI * 2;
        const velocity = 50 + Math.random() * 300;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity - 150; // Bias upwards

        gsap.to(conf, {
            x: tx,
            y: ty,
            rotation: Math.random() * 720 - 360,
            duration: 1 + Math.random(),
            ease: "power2.out",
            opacity: 0,
            delay: Math.random() * 0.2,
            onComplete: () => conf.remove()
        });
    }
}

async function triggerSort(startCell) {
    if (startCell.stack.length === 0 || startCell.isSorting) return;

    let sortingHappened = true;
    let currentTarget = startCell;

    while (sortingHappened) {
        sortingHappened = false;
        if (currentTarget.stack.length === 0) break;

        const topColor = currentTarget.stack[currentTarget.stack.length - 1].color;

        // Find all connected cells with the same top color
        const cluster = new Set([currentTarget]);
        const queue = [currentTarget];

        while (queue.length > 0) {
            const curr = queue.shift();
            for (let n of getNeighbors(curr)) {
                if (n.stack.length > 0 && n.stack[n.stack.length - 1].color === topColor && !cluster.has(n) && !n.isSorting) {
                    cluster.add(n);
                    queue.push(n);
                }
            }
        }

        const clusterArray = Array.from(cluster);
        if (clusterArray.length <= 1) break; // No matches

        // Lock all cells in cluster
        clusterArray.forEach(c => c.isSorting = true);

        // Calculate run lengths for each cell in cluster
        let maxRun = 0;
        let bestCell = currentTarget;

        const cellRuns = clusterArray.map(c => {
            let runLength = 0;
            const piecesToMove = [];
            for (let i = c.stack.length - 1; i >= 0; i--) {
                if (c.stack[i].color === topColor) {
                    runLength++;
                    piecesToMove.unshift(c.stack[i]);
                } else break;
            }
            if (runLength > maxRun) {
                maxRun = runLength;
                bestCell = c;
            } else if (runLength === maxRun && c === currentTarget) {
                bestCell = currentTarget; // Tie breaker favors the actively triggering cell
            }
            return { cell: c, runLength, pieces: piecesToMove };
        });

        const targetCell = bestCell;

        // Prepare transfers (everyone except targetCell moves to targetCell)
        const transfers = cellRuns.filter(cr => cr.cell !== targetCell);

        if (transfers.length > 0) {
            sortingHappened = true;
            const animations = [];

            let currentTargetHeight = targetCell.stack.length;

            for (let t of transfers) {
                // Remove from source data immediately
                t.cell.stack.splice(t.cell.stack.length - t.pieces.length, t.pieces.length);

                for (let i = 0; i < t.pieces.length; i++) {
                    const piece = t.pieces[i];
                    if (piece.mesh && piece.mesh.parent) {
                        scene.attach(piece.mesh); // Animate in world space
                    }

                    const targetY = (currentTargetHeight + i) * HEX_HEIGHT;
                    const endPos = new THREE.Vector3(targetCell.x, HEX_HEIGHT + targetY, targetCell.z);

                    animations.push(new Promise(resolve => {
                        gsap.to(piece.mesh.position, {
                            x: endPos.x,
                            z: endPos.z,
                            duration: 0.3,
                            delay: i * 0.08,
                            ease: "power2.inOut",
                            onStart: () => playSound('sort', 400 + i * 50, 0.08)
                        });
                        gsap.to(piece.mesh.position, {
                            y: endPos.y + 2,
                            duration: 0.15,
                            delay: i * 0.08,
                            yoyo: true,
                            repeat: 1,
                            ease: "sine.out",
                            onComplete: resolve
                        });
                    }));
                }
                currentTargetHeight += t.pieces.length;
            }

            await Promise.all(animations);

            // Update Target Cell Data
            for (let t of transfers) {
                targetCell.stack.push(...t.pieces);
            }

            // Visually rebuild
            rebuildCellStack(targetCell);
            transfers.forEach(t => rebuildCellStack(t.cell));

            // MERGE check on targetCell
            const newTopColor = targetCell.stack[targetCell.stack.length - 1].color;
            let runLength = 0;
            for (let i = targetCell.stack.length - 1; i >= 0; i--) {
                if (targetCell.stack[i].color === newTopColor) runLength++;
                else break;
            }

            if (runLength >= 10) {
                const popped = targetCell.stack.splice(targetCell.stack.length - runLength, runLength);
                updateScore(runLength * 10);

                const pops = popped.map((p, index) => new Promise(resolve => {
                    p.mesh.material.transparent = true;
                    if (p.mesh.parent) scene.attach(p.mesh);

                    gsap.to(p.mesh.scale, {
                        x: 1.5, y: 1.5, z: 1.5,
                        duration: 0.2,
                        delay: index * 0.05,
                        onStart: () => playSound('merge', 600 + index * 40, 0.1)
                    });
                    gsap.to(p.mesh.material, {
                        opacity: 0,
                        duration: 0.2,
                        delay: index * 0.05,
                        onComplete: () => {
                            if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
                            p.mesh.geometry.dispose();
                            p.mesh.material.dispose();
                            resolve();
                        }
                    });
                }));
                await Promise.all(pops);
                rebuildCellStack(targetCell);
            }

            await new Promise(r => setTimeout(r, 100));

            // Unlock cluster
            clusterArray.forEach(c => c.isSorting = false);

            // Cascade to the sources that gave up pieces
            for (let t of transfers) {
                if (t.cell.stack.length > 0) {
                    await triggerSort(t.cell);
                }
            }

            // Loop will continue with targetCell as the active trigger point
            currentTarget = targetCell;
        } else {
            // Unlock if no transfers happened (shouldn't really happen if cluster > 1)
            clusterArray.forEach(c => c.isSorting = false);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

animate();

