import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// 1. 场景、相机、渲染器
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x172033);

const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.1, 100
);
camera.position.set(7, 7, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
controls.enablePan = true;

controls.mouseButtons = {
  LEFT: THREE.MOUSE.PAN,      // 左键拖动：平移
  MIDDLE: THREE.MOUSE.DOLLY,  // 中键拖动：缩放
  RIGHT: THREE.MOUSE.ROTATE   // 右键拖动：旋转
};

// 2. 灯光
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2));

const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(4, 8, 5);
scene.add(light);

// 3. 参数
const discRadius = 3;
let magnetRingRadius = 2;
let magnetCount = 8;
let distributionAngle = 360;
const ballRadius = 0.25;

let rpm = 20;
let paused = false;

// 创建圆柱体的辅助函数
function cylinder(radius, height, color) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 64),
    new THREE.MeshStandardMaterial({ color })
  );
}

// 4. 转动组件：盘和磁铁都加入这个组
const rotor = new THREE.Group();
scene.add(rotor);

const disc = cylinder(discRadius, 0.2, 0x46536a);
rotor.add(disc);

// 转轴
const axle = cylinder(0.12, 1.2, 0xaaaaaa);
axle.position.y = -0.6;
scene.add(axle);

// 5. 磁铁：每块由红蓝两半组成
// 红色代表 N 极，蓝色代表 S 极
const magnetHeight = 0.4;

// 单独保存所有磁铁，方便重新生成
const magnetsGroup = new THREE.Group();
rotor.add(magnetsGroup);

function rebuildMagnets() {
  // 删除旧磁铁，并释放不再使用的资源
  while (magnetsGroup.children.length > 0) {
    const oldMagnet = magnetsGroup.children[0];

    oldMagnet.traverse((object) => {
      if (object.isMesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });

    magnetsGroup.remove(oldMagnet);
  }

  const arc = THREE.MathUtils.degToRad(distributionAngle);
  const fullCircle = distributionAngle === 360;

  for (let i = 0; i < magnetCount; i++) {
    // 整圆不重复放置终点；圆弧包含两端
    const angleStep = fullCircle
    ? arc / magnetCount
    : arc / (magnetCount - 1);

const angle = -arc / 2 + i * angleStep;

    const northUp = i % 2 === 0;
    const magnet = new THREE.Group();

    const upper = cylinder(
      0.28,
      magnetHeight / 2,
      northUp ? 0xff4545 : 0x3485ff
    );

    const lower = cylinder(
      0.28,
      magnetHeight / 2,
      northUp ? 0x3485ff : 0xff4545
    );

    upper.position.y = magnetHeight / 4;
    lower.position.y = -magnetHeight / 4;

    magnet.add(upper, lower);

    // 这里决定每块磁铁的位置
    magnet.position.set(
      magnetRingRadius * Math.cos(angle),
      0.1 + magnetHeight / 2,
      magnetRingRadius * Math.sin(angle)
    );

    magnetsGroup.add(magnet);
  }
}

rebuildMagnets();

// 6. 固定透明板
const plateY = 0.85;
const plateThickness = 0.08;

const plate = new THREE.Mesh(
  new THREE.CylinderGeometry(3.2, 3.2, plateThickness, 96),
  new THREE.MeshStandardMaterial({
    color: 0xaaddff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    roughness: 0.25
  })
);

plate.position.y = plateY;
scene.add(plate);

// 固定板的边缘
const rim = new THREE.Mesh(
  new THREE.TorusGeometry(3.2, 0.025, 8, 96),
  new THREE.MeshStandardMaterial({ color: 0xaaddff })
);
rim.rotation.x = Math.PI / 2;
rim.position.y = plateY;
scene.add(rim);

// 7. 钢球：固定在板上
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(ballRadius, 32, 24),
  new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    metalness: 0.65,
    roughness: 0.25
  })
);

ball.position.set(
  magnetRingRadius,
  plateY + plateThickness / 2 + ballRadius,
  0
);
scene.add(ball);

// 给球增加标记，之后方便观察自转
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.045, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xffcc00 })
);
marker.position.y = ballRadius;
ball.add(marker);

// ---------- 物理参数 ----------
// 保留现有画面尺寸：1 个画面单位对应 3 cm
const METERS_PER_UNIT = 0.03;
const MU0_OVER_4PI = 1e-7;

// 由球半径和钢的密度计算质量
const steelDensity = 7800; // kg/m³
const physicalRadius = ballRadius * METERS_PER_UNIT;
const ballMass =
  steelDensity * (4 / 3) * Math.PI * physicalRadius ** 3;

// 每块磁铁的磁矩，单位 A·m²
// 这里是演示参数，之后需要根据实际磁铁确定
let magnetMoment = 0.3;

// 高磁导率球在线性、未饱和近似下的响应系数
const magneticResponse =
  4 * Math.PI * physicalRadius ** 3 / (4 * Math.PI * 1e-7);

// 简单速度阻尼，单位 kg/s
// 用来先观察稳定运动，尚不是接触摩擦模型
const dragCoefficient = 0.02;

// 物理状态全部采用 SI 单位
const ballPosition = ball.position.clone()
  .multiplyScalar(METERS_PER_UNIT);

const ballVelocity = new THREE.Vector3();

const gravityAcceleration = 9.81;

// 显示用：1 N 对应多少画面单位
const forceArrowScale = 10;

// 保存各个力，单位 N
const forces = {
  magnetic: new THREE.Vector3(),
  drag: new THREE.Vector3(),
  gravity: new THREE.Vector3(0, -ballMass * gravityAcceleration, 0),
  normal: new THREE.Vector3(),
  net: new THREE.Vector3()
};

function createForceArrow(color) {
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    ball.position,
    1,
    color
  );

  arrow.visible = false;
  scene.add(arrow);
  return arrow;
}

const forceArrows = {
  magnetic: createForceArrow(0xff5555),
  drag: createForceArrow(0xffaa33),
  gravity: createForceArrow(0x4488ff),
  normal: createForceArrow(0x55dd88),
  net: createForceArrow(0xffff55)
};

// 独立受力图：位于系统上方
const isolatedDiagram = new THREE.Group();
isolatedDiagram.position.set(0, 4, 0);
scene.add(isolatedDiagram);

// 用一个小白点表示钢球
const isolatedPoint = new THREE.Mesh(
  new THREE.SphereGeometry(0.07, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
isolatedDiagram.add(isolatedPoint);

// 复制一组受力箭头，起点位于质点中心
const isolatedArrows = {};

const forceColors = {
  magnetic: 0xff5555,
  drag: 0xffaa33,
  gravity: 0x4488ff,
  normal: 0x55dd88,
  net: 0xffff55
};

for (const name of Object.keys(forceColors)) {
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 0),
    1,
    forceColors[name]
  );

  arrow.visible = false;
  isolatedDiagram.add(arrow);
  isolatedArrows[name] = arrow;
}

// 更新独立受力图
function updateIsolatedDiagram() {
  for (const name of Object.keys(isolatedArrows)) {
    const arrow = isolatedArrows[name];
    const force = forces[name];
    const magnitude = force.length();

    arrow.visible = magnitude > 1e-9;
    if (!arrow.visible) continue;

    arrow.setDirection(force.clone().normalize());

    const length = magnitude * forceArrowScale;

    arrow.setLength(
      length,
      Math.min(0.15, length * 0.25),
      Math.min(0.07, length * 0.12)
    );
  }
}

function updateForceArrows() {
  for (const name of Object.keys(forceArrows)) {
    const arrow = forceArrows[name];
    const force = forces[name];
    const magnitude = force.length();

    arrow.visible = magnitude > 1e-9;

    if (!arrow.visible) continue;

    arrow.position.copy(ball.position);
    arrow.setDirection(force.clone().normalize());

    const length = magnitude * forceArrowScale;

    arrow.setLength(
      length,
      Math.min(0.15, length * 0.25),
      Math.min(0.07, length * 0.12)
    );
  }
}

// 每个物理时间步缓存磁铁的世界位置和磁矩
const magnetSources = [];
const worldPosition = new THREE.Vector3();

function updateMagnetSources() {
  rotor.updateMatrixWorld(true);
  magnetSources.length = 0;

  magnetsGroup.children.forEach((magnet, index) => {
    magnet.getWorldPosition(worldPosition);

    magnetSources.push({
      position: worldPosition.clone()
        .multiplyScalar(METERS_PER_UNIT),

      // 当前磁铁始终沿竖直方向，交替朝上、朝下
      moment: new THREE.Vector3(
        0,
        index % 2 === 0 ? magnetMoment : -magnetMoment,
        0
      )
    });
  });
}

// 计算某个物理位置处的磁场，返回单位 T
function fieldAt(position) {
    const total = new THREE.Vector3();
  
    for (const source of magnetSources) {
      const offset = position.clone().sub(source.position);
      const distance = offset.length();
  
      // 当前装置有固定间隙；如果间隙被改得极小，停止计算
      if (distance < 1e-6) {
        throw new Error("球与磁偶极子距离过小，请增大板的高度");
      }
  
      const direction = offset.multiplyScalar(1 / distance);
      const projection = source.moment.dot(direction);
  
      const contribution = direction
        .multiplyScalar(3 * projection)
        .sub(source.moment)
        .multiplyScalar(MU0_OVER_4PI / distance ** 3);
  
      total.add(contribution);
    }
  
    return total;
  }
  
  // F = α/2 × ∇(B²)
  // 用中心差分计算磁场强度平方的空间梯度
  function magneticForceAt(position) {
    const epsilon = 0.0001; // 0.1 mm
    const force = new THREE.Vector3();
  
    for (const axis of ["x", "y", "z"]) {
      const plus = position.clone();
      const minus = position.clone();
  
      plus[axis] += epsilon;
      minus[axis] -= epsilon;
  
      const bSquaredPlus = fieldAt(plus).lengthSq();
      const bSquaredMinus = fieldAt(minus).lengthSq();
  
      const gradient =
        (bSquaredPlus - bSquaredMinus) / (2 * epsilon);
  
      force[axis] = 0.5 * magneticResponse * gradient;
    }
  
    return force;
  }
  
  function resetBall() {
    ballPosition.set(
      magnetRingRadius * METERS_PER_UNIT,
      (plateY + plateThickness / 2 + ballRadius) * METERS_PER_UNIT,
      0
    );
  
    ballVelocity.set(0, 0, 0);
  
    ball.position.copy(ballPosition)
      .multiplyScalar(1 / METERS_PER_UNIT);
  }
  
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
  
      // 避免长按空格时反复切换
      if (event.repeat) return;
  
      paused = !paused;
      accumulator = 0;
    }
  });


// 8. 参考地面
const grid = new THREE.GridHelper(12, 24);
grid.position.y = -1.3;
scene.add(grid);

// 9. 操作面板
const panel = document.createElement("div");
panel.style.cssText = `
  position: fixed;
  top: 16px;
  left: 16px;
  padding: 14px;
  background: #000a;
  color: white;
  font: 14px sans-serif;
  border-radius: 10px;
  max-height: calc(100vh - 60px);
overflow-y: auto;
`;

panel.innerHTML = `
  <b>Magnetic carousel · 装置模型</b>
  <p>红色 N 极 / 蓝色 S 极</p>
  <label>
    转速：<span id="rpmValue">20</span> RPM
    <br>
    <input id="speed" type="range"
      min="-60" max="60" step="1" value="20">
  </label>
  <p>
  <label>
    磁铁数量：<span id="countValue">8</span>
    <br>
    <input id="count" type="range"
      min="2" max="16" step="2" value="8">
  </label>
</p>

<p>
  <label>
    分布半径：<span id="radiusValue">2.00</span>
    <br>
    <input id="radius" type="range"
      min="0.8" max="2.7" step="0.05" value="2">
  </label>
</p>

<p>
  <label>
    分布范围：<span id="angleValue">360</span>°
    <br>
    <input id="angle" type="range"
      min="60" max="360" step="10" value="360">
  </label>
</p>
<p>
  <label>
    磁铁磁矩：<span id="momentValue">0.30</span> A·m²
    <br>
    <input id="moment" type="range"
      min="0" max="1" step="0.01" value="0.3">
  </label>
</p>
<div style="line-height: 1.6; margin-top: 10px;">
  <b>受力大小 / N</b>
  <div style="color:#ff5555">磁力：<span id="magneticForceValue">0</span></div>
  <div style="color:#ffaa33">阻尼：<span id="dragForceValue">0</span></div>
  <div style="color:#4488ff">重力：<span id="gravityForceValue">0</span></div>
  <div style="color:#55dd88">支持力：<span id="normalForceValue">0</span></div>
  <div style="color:#ffff55">合力：<span id="netForceValue">0</span></div>
</div>
  <p><button id="reset">重置钢球</button></p>
  <small>拖动旋转视角 · 滚轮缩放<br>磁力吸引模型 · 空格重置钢球</small>
`;

document.body.appendChild(panel);

const forceValueElements = {
    magnetic: document.getElementById("magneticForceValue"),
    drag: document.getElementById("dragForceValue"),
    gravity: document.getElementById("gravityForceValue"),
    normal: document.getElementById("normalForceValue"),
    net: document.getElementById("netForceValue")
  };
  
  function updateForcePanel() {
    for (const name of Object.keys(forceValueElements)) {
      forceValueElements[name].textContent =
        forces[name].length().toExponential(2);
    }
  }

document.getElementById("moment").addEventListener("input", (event) => {
    magnetMoment = Number(event.target.value);
  
    document.getElementById("momentValue").textContent =
      magnetMoment.toFixed(2);
  });

document.getElementById("count").addEventListener("input", (event) => {
    magnetCount = Number(event.target.value);
    document.getElementById("countValue").textContent = magnetCount;
    rebuildMagnets();
  });
  
  document.getElementById("radius").addEventListener("input", (event) => {
    magnetRingRadius = Number(event.target.value);
    document.getElementById("radiusValue").textContent =
      magnetRingRadius.toFixed(2);
    rebuildMagnets();
  });
  
  document.getElementById("angle").addEventListener("input", (event) => {
    distributionAngle = Number(event.target.value);
    document.getElementById("angleValue").textContent = distributionAngle;
    rebuildMagnets();
  });

// 隐藏旧 HTML 中的操作提示
const oldHint = document.getElementById("hint");
if (oldHint) oldHint.style.display = "none";

document.getElementById("speed").addEventListener("input", (event) => {
  rpm = Number(event.target.value);
  document.getElementById("rpmValue").textContent = rpm;
});

document.getElementById("reset").addEventListener("click", (event) => {
    resetBall();
    paused = false;
    accumulator = 0;
  
    // 取消按钮焦点，避免空格再次触发按钮
    event.currentTarget.blur();
  });

// 10. 固定时间步物理计算
const fixedDt = 1 / 240;
let accumulator = 0;
let previousTime;

function physicsStep(dt) {
  // 转盘和钢球在同一个时间步内推进
  const angularSpeed = rpm * 2 * Math.PI / 60;
  rotor.rotation.y += angularSpeed * dt;

  updateMagnetSources();



// 完整三维磁力
forces.magnetic.copy(magneticForceAt(ballPosition));

// 保持接触、竖直加速度为零所需的支持力
const requiredNormal =
  ballMass * gravityAcceleration - forces.magnetic.y;

// 如果需要向下的支持力，固定高度模型不再适用
if (requiredNormal < 0) {
  paused = true;


  console.warn("钢球可能脱离板面，当前固定高度模型不适用。");

  forces.normal.set(0, 0, 0);
  forces.drag.copy(ballVelocity).multiplyScalar(-dragCoefficient);
  forces.net.copy(forces.magnetic)
    .add(forces.gravity)
    .add(forces.drag);

  return;
}

forces.normal.set(0, requiredNormal, 0);

// 水平磁力改变平动速度
const horizontalForce = forces.magnetic.clone();
horizontalForce.y = 0;

ballVelocity.addScaledVector(horizontalForce, dt / ballMass);

// 保留原来的指数阻尼更新
ballVelocity.multiplyScalar(
  Math.exp(-dragCoefficient * dt / ballMass)
);

ballVelocity.y = 0;

// 显示更新后速度对应的瞬时阻尼力
forces.drag.copy(ballVelocity).multiplyScalar(-dragCoefficient);

// 合力：磁力 + 阻尼 + 重力 + 支持力
forces.net.copy(forces.magnetic)
  .add(forces.drag)
  .add(forces.gravity)
  .add(forces.normal);

  ballPosition.addScaledVector(ballVelocity, dt);

  // 超出板面时停止并提示；不人为增加边缘挡墙
  const plateRadius = 3.2 * METERS_PER_UNIT;

  if (Math.hypot(ballPosition.x, ballPosition.z) > plateRadius) {
    paused = true;
    console.warn("钢球已离开板面范围，请按空格重置。");
  }
}

function animate(timeMs) {
  requestAnimationFrame(animate);

  const time = timeMs / 1000;
  const frameDt = previousTime === undefined
    ? 0
    : Math.min(time - previousTime, 0.05);

  previousTime = time;

  if (!paused) {
    accumulator += frameDt;

    while (accumulator >= fixedDt && !paused) {
      physicsStep(fixedDt);
      accumulator -= fixedDt;
    }
  } else {
    accumulator = 0;
  }

  // 物理坐标（米）转换回画面坐标
  ball.position.copy(ballPosition)
    .multiplyScalar(1 / METERS_PER_UNIT);

    updateForceArrows();       // 钢球上的受力箭头
    updateIsolatedDiagram();  // 系统上方的独立受力图
    updateForcePanel();       // 面板数值

  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});