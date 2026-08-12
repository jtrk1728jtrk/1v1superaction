import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetUrl } from "../utils/assetPath";

/* ------------------------------------------------------------------
   THE WARDEN — 1vs1 デュエル試作 (Furi 風)
   遠距離フェーズと斬撃フェーズを行き来する多段ボス戦。
   コア: パリィ(受け) / 回避ダッシュ / 弾を撃ち返す

   素材(3Dモデル・BGM・効果音)は /public/assets 配下の外部ファイルを
   fetch + GLTFLoader / Web Audio API で読み込む。zipやURL入力による
   手動読み込みは行わない。
------------------------------------------------------------------ */

const C = {
  void: 0x0b0620,
  arena: 0x141033,
  grid: 0x3b2f7a,
  rim: 0x6c4cff,
  player: 0x7ff7e8,
  boss: 0xff2e6e,
  parry: 0xffd84d,
  reflect: 0xa9ffee,
  hard: 0xffffff, // 破壊できない弾
  inq: 0x8b5cf6, // 審問官の色
};

const ARENA_R = 44; // フィールド半径（従来の2倍）
const PLAYER_SPEED = 20.5;
const DASH_SPEED = 38; // 回避の移動速度
const DASH_TIME = 0.185; // 38 × 0.185 ≒ 7.0 の移動距離になる
const DASH_IFRAME = 0.25; // 回避中の無敵時間（回避動作より長めに確保）
const DASH_CD = 0.3; // 回避後の硬直（次に回避できるまで）
const BEAM_LEN = 60; // 光条の長さ
const BEAM_COUNT = 3; // 同時に出せる光条の本数
const MINE_MAX = 12; // 伏火の最大数
const MINE_FUSE = 1.25; // 起爆までの時間
const MINE_RADIUS = 7.0; // 爆発半径
const BOSS_SWING_RANGE = 7.6; // ボスの斬撃が届く距離
const COMBO_APPROACH = 30; // 連続斬りの接近速度（主人公の20.5より速く）
const COMBO_HOLD = 5.0; // この距離まで詰めて振る
const COMBO_LUNGE = 0.16; // 踏み込みながら振る時間
const RUSH_SPEED = 64; // 突進速度（溜めてから一息に踏み込む）
const RUSH_STOP = 5.2; // この距離まで詰めたら斬る
const RUSH_HOMING = 2.6; // 突進中の軌道補正の強さ（大きいほど避けにくい）
const BOSS_RETREAT_TIME = 0.55; // 気絶回復後に距離を取る時間
const BOSS_RETREAT_SPEED = 26;
const WAVE_CHARGE = 0.78; // 衝撃波の溜め時間（収束が速い）
const WAVE_SPEED = 48; // 衝撃波の伝播速度
const WAVE_FADE = 0.4; // 減衰。フィールド端(最大約88)まで届く寿命になる
const PARRY_WINDOW = 0.18; // 受付窓
const PARRY_CD = 0.45; // 硬直
const MELEE_RANGE = 4.6;
const MELEE_ARC = Math.PI * 0.55;
const SLASH_LUNGE_SPEED = 14; // 斬撃時にわずかに踏み込む速度
const SLASH_LUNGE_STOP = 3.4; // ここより詰めない（ボスにめり込む＝貫通を防ぐ）
const COMBO_HOMING = 12; // ボスの連続斬りの踏み込み中の軌道補正の強さ（大きいほど避けにくい）
const SHOOT_CD = 0.13;
const SHOOT_DMG = 1.6;
const BSPEED = 46;
const PLAYER_HP = 5;
const HIT_IFRAME = 1.0;
const PARRY_IFRAME = 0.8; // パリィ成功後の猶予。直後の追撃で被弾しないように
const COMBO_WINDOW = 0.75; // この時間内に再入力すれば連撃が繋がる
// 3連斬り。ts=再生速度, windup=入力から命中までのタメ, cd=次の入力を受け付けるまで
// 3段目は大きく振りかぶるぶん、タメも隙も長いかわりに火力が高い
const COMBO = [
  { clip: "Sword_Slash", ts: 1.7, cd: 0.17, dmg: 6, windup: 0.05, sfx: "slash1" },
  { clip: "Punch_Left", ts: 1.85, cd: 0.16, dmg: 6, windup: 0.05, sfx: "slash2" },
  { clip: "Kick_Right", ts: 1.4, cd: 0.34, dmg: 14, windup: 0.10, sfx: "slash3" },
];
// モデルが正面を向く基準がゲーム内の「前方」とズレている場合はここを調整する。
// 移動時に後ろ向きに歩いて見えたら Math.PI に変更する。
const PLAYER_MODEL_FACING_OFFSET = 0;
const PLAYER_MODEL_SCALE = 1.7;
const BOSS_MODEL_SCALE = 2.5; // 主人公より一回り大きく見せる
// ボスが使うアニメーション
const BCLIP = {
  idle: "Idle_Neutral",
  run: "Run",
  ready: "Idle_Sword", // 斬撃の予兆で構える
  shoot: "Gun_Shoot",
  slash: "Sword_Slash",
  slash2: "Punch_Right",
  slash3: "Kick_Left",
  wave: "Interact",
  dodge: "Roll",
  hit: "HitRecieve",
  death: "Death",
}; // モデルの身長が約1.9のため、ボスと並ぶ大きさに調整
// 使用するアニメーションクリップ名。
// 注意: このモデルの "Idle" と "Idle_Sword" は腕が初期姿勢(T字)のままなので使わない。
const CLIP = {
  idle: "Idle_Neutral",
  run: "Run",
  aimIdle: "Idle_Gun_Shoot",
  aimRun: "Run_Shoot",
  slash: "Sword_Slash",
  dodge: "Roll",
  parry: "Punch_Left",
  hit: "HitRecieve",
  death: "Death",
};

/* ------------------------------------------------------------------
   素材読み込み: /public/assets 配下のglTF(.glb)・音声(.mp3)を
   外部ファイルとしてfetchする。コードへの埋め込みは行わない。
------------------------------------------------------------------ */
async function loadAssets(onProgress) {
  const get = async (label, path) => {
    if (onProgress) onProgress(label);
    const url = assetUrl(path);
    const res = await fetch(url);
    if (!res.ok) throw new Error(path + " が取得できません (HTTP " + res.status + ")");
    return await res.arrayBuffer();
  };
  const playerGlb = await get("主人公モデル", "models/player.glb");
  const bossGlb = await get("ボスモデル", "models/boss.glb");
  const bgm = await get("BGM", "audio/bgm.mp3");
  const slash1 = await get("効果音(斬撃1段目)", "audio/slash1.mp3");
  const slash2 = await get("効果音(斬撃2段目)", "audio/slash2.mp3");
  const slash3 = await get("効果音(斬撃3段目)", "audio/slash3.mp3");
  const parry = await get("効果音(パリィ受付)", "audio/parry.mp3");
  const parry2 = await get("効果音(パリィ成功)", "audio/parry2.mp3");
  const dash = await get("効果音(回避)", "audio/dash.mp3");
  const shoot = await get("効果音(射撃)", "audio/shoot.mp3");
  const enemyDanger = await get("効果音(敵の危険攻撃予兆)", "audio/enemy_danger.mp3");
  return {
    playerGlb,
    bossGlb,
    bgm,
    sfx: { slash1, slash2, slash3, parry, parry2, dash, shoot, enemyDanger },
  };
}

// ボスのHPは1本の連続したゲージ。ラウンド制で相ごとにHPを回復させるのではなく、
// 残りHPの割合に応じて攻撃パターン（Phase）が自動的に切り替わる。
// startFrac はテストプレイでそのPhaseを直接選んだ時の開始HP割合。
const BOSS_HP = 800;
const STAGES = [
  {
    name: "Shadow",
    kit: "warden",
    tint: 0xff2e6e,
    scale: 2.5,
    phases: [
      { name: "Phase 1", startFrac: 1.0, melee: 0.22, speed: 1.0 },
      { name: "Phase 2", startFrac: 0.69, melee: 0.88, speed: 1.08 },
      { name: "Phase 3", startFrac: 0.35, melee: 0.72, speed: 1.22 },
    ],
  },
  {
    name: "Judge",
    kit: "inquisitor",
    tint: 0x8b5cf6,
    scale: 2.9,
    phases: [
      { name: "Phase 1", startFrac: 1.0, melee: 0.12, speed: 1.0 },
      { name: "Phase 2", startFrac: 0.69, melee: 0.28, speed: 1.1 },
      { name: "Phase 3", startFrac: 0.35, melee: 0.5, speed: 1.25 },
    ],
  },
];

// 残りHP割合から、そのタイミングで使うPhase（攻撃パターン）を決める。
// 100%〜70%=Phase1, 69%〜36%=Phase2, 35%〜撃破まで=Phase3。
function phaseIndexForFrac(frac) {
  if (frac >= 0.7) return 0;
  if (frac >= 0.36) return 1;
  return 2;
}

/* ------------------------------------------------------------------
   BGM: 読み込んだmp3を再生する。
   イントロを1回鳴らしたあと、本編42小節（6.857s〜78.857s）だけを
   繰り返すことで、小節が揃った継ぎ目のないループにする。
   楽曲: BGMer「警告サイン」(140BPM)
------------------------------------------------------------------ */
const BGM_LOOP_START = 6.857143; // 4小節目の頭
const BGM_LOOP_END = 78.857143; // 46小節目の頭（42小節ぶん）

function createMusic(assets) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  let ctx;
  try {
    // latencyHint を指定しないと端末によって再生バッファが大きく取られ、
    // 効果音が体感で遅れる。対話用の低遅延を明示する。
    ctx = new AC({ latencyHint: "interactive" });
  } catch (e) {
    try {
      ctx = new AC();
    } catch (e2) {
      return null;
    }
  }

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);

  // 効果音はBGMとは別系統。BGMを絞っても効果音の音量は変わらない
  const sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.85;
  sfxGain.connect(ctx.destination);
  const sfxBuffers = {};

  function decodeInto(arrayBuf, key) {
    if (!arrayBuf) return;
    const onOk = (b) => {
      if (sfxBuffers[key]) return;
      sfxBuffers[key] = b;
    };
    try {
      // decodeAudioData は渡した ArrayBuffer を無効化するので複製して渡す
      const p = ctx.decodeAudioData(arrayBuf.slice(0), onOk, () => {});
      if (p && typeof p.then === "function") p.then(onOk).catch(() => {});
    } catch (e) {}
  }
  decodeInto(assets.sfx.slash1, "slash1");
  decodeInto(assets.sfx.slash2, "slash2");
  decodeInto(assets.sfx.slash3, "slash3");
  decodeInto(assets.sfx.parry, "parry");
  decodeInto(assets.sfx.parry2, "parry2");
  decodeInto(assets.sfx.dash, "dash");
  decodeInto(assets.sfx.shoot, "shoot");
  decodeInto(assets.sfx.enemyDanger, "enemyDanger");

  let buffer = null;
  let source = null;
  let wantPlay = false;
  let muted = false;
  let active = true;
  let disposed = false;

  function targetGain() {
    if (muted || disposed) return 0.0001;
    return active ? 0.42 : 0.1; // 戦闘中以外は絞る
  }

  function ramp(sec) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.linearRampToValueAtTime(targetGain(), now + (sec || 0.6));
  }

  function play() {
    if (!buffer || source || disposed) return;
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = BGM_LOOP_START;
    source.loopEnd = BGM_LOOP_END;
    source.connect(master);
    source.start(0); // 0秒目（イントロ）から再生し、以降はループ区間を繰り返す
  }

  // mp3をデコードする
  function decode() {
    if (!assets || !assets.bgm) return;
    const onOk = (b) => {
      if (buffer || disposed) return; // 二重呼び出し対策
      buffer = b;
      if (wantPlay) {
        play();
        ramp();
      }
    };
    const onErr = () => {};
    try {
      const p = ctx.decodeAudioData(assets.bgm.slice(0), onOk, onErr);
      if (p && typeof p.then === "function") p.then(onOk).catch(onErr);
    } catch (e) {
      /* デコード不可の環境では無音になる */
    }
  }
  decode();

  return {
    start() {
      if (ctx.state === "suspended") ctx.resume();
      wantPlay = true;
      play();
      ramp();
    },
    setPhase() {
      /* 楽曲は1曲通しなので相による切り替えはしない */
    },
    setMuted(m) {
      muted = !!m;
      sfxGain.gain.value = muted ? 0 : 0.85;
      ramp(0.3);
    },
    playSfx(key, vol, rate) {
      if (muted || disposed) return;
      const b = sfxBuffers[key];
      if (!b) return;
      if (ctx.state === "suspended") ctx.resume();
      const s = ctx.createBufferSource();
      s.buffer = b;
      if (rate != null && rate !== 1) s.playbackRate.value = rate;
      if (vol != null && vol !== 1) {
        const g = ctx.createGain();
        g.gain.value = vol;
        s.connect(g);
        g.connect(sfxGain);
      } else {
        s.connect(sfxGain);
      }
      s.start(0);
    },
    setActive(a) {
      active = !!a;
      ramp();
    },
    dispose() {
      disposed = true;
      try {
        if (source) source.stop();
      } catch (e) {}
      source = null;
      try {
        ctx.close();
      } catch (e) {}
    },
  };
}

export default function FuriDuel() {
  const mountRef = useRef(null);
  const [screen, setScreen] = useState("loading");
  const [assets, setAssets] = useState(null);
  const [loadMsg, setLoadMsg] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [banner, setBanner] = useState(null);
  const [bannerShow, setBannerShow] = useState(false);
  const [clearedBosses, setClearedBosses] = useState(() => new Set());
  const apiRef = useRef(null);

  // 通常のステージセレクト（ゲームオーバー画面から）は撃破済みのボスだけを選べるようにする
  function markCleared(stageIdx) {
    setClearedBosses((prev) => (prev.has(stageIdx) ? prev : new Set(prev).add(stageIdx)));
  }

  // バナー文字をフェードインさせる。マウント直後に opacity を 0→1 にするため
  // 1フレーム遅らせてから表示状態にする。
  useEffect(() => {
    if (banner) {
      const id = requestAnimationFrame(() => setBannerShow(true));
      return () => cancelAnimationFrame(id);
    }
    setBannerShow(false);
  }, [banner]);

  // HUD refs (毎フレーム直接DOM更新して再描画を避ける)
  const bossFill = useRef(null);
  const bossLabel = useRef(null);
  const heartRefs = [
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
  ];
  const dashRing = useRef(null);
  const parryRing = useRef(null);
  const flashRef = useRef(null);
  const diagRef = useRef(null);
  const musicRef = useRef(null);
  const [musicOn, setMusicOn] = useState(true);
  const [startPressed, setStartPressed] = useState(false);

  // 起動時に /public/assets から素材を読み込む
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await loadAssets((label) => setLoadMsg(label + " を読み込み中"));
        if (cancelled) return;
        setAssets(a);
        setLoadMsg(null);
        setScreen("title");
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setLoadErr(String((err && err.message) || err));
          setLoadMsg(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!assets) return; // 素材が揃うまでシーンを作らない
    const mount = mountRef.current;
    if (!mount) return;

    /* ---------------- renderer / scene ---------------- */
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(C.void);
    scene.fog = new THREE.Fog(C.void, 55, 165); // 広くなった分だけ霧も遠くへ

    const camera = new THREE.PerspectiveCamera(
      58,
      mount.clientWidth / mount.clientHeight,
      0.1,
      300
    );
    camera.position.set(0, 12, -16);

    // three.js は物理ベースの光量単位のみに対応しており(旧unitlessモードは廃止)、
    // 数値の意味が昔と異なる。DirectionalLight/AmbientLightはπ倍、Point/SpotLightは
    // 4π倍にすると旧unitless表記と同等の明るさになる（公式移行ガイドの換算式）。
    // これをしないと自己発光(emissive)の色だけが浮いて見え、モデルの陰影が
    // ほぼ真っ黒になってしまう。
    scene.add(new THREE.AmbientLight(0x5a4b9c, 1.0 * Math.PI));
    const key = new THREE.DirectionalLight(0xa78bfa, 0.7 * Math.PI);
    key.position.set(6, 18, -8);
    scene.add(key);
    const bossLight = new THREE.PointLight(C.boss, 0.12 * 4 * Math.PI, 40);
    scene.add(bossLight);

    /* ---------------- arena ---------------- */
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_R, 72),
      new THREE.MeshBasicMaterial({ color: C.arena })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const polar = new THREE.PolarGridHelper(ARENA_R, 16, 6, 72, C.grid, C.grid);
    polar.position.y = 0.02;
    polar.material.opacity = 0.5;
    polar.material.transparent = true;
    scene.add(polar);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_R, 0.22, 8, 96),
      new THREE.MeshBasicMaterial({ color: C.rim })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.1;
    scene.add(rim);

    /* ---------------- player (GLTFモデル) ---------------- */
    const playerMesh = new THREE.Group();
    playerMesh.scale.setScalar(PLAYER_MODEL_SCALE);
    scene.add(playerMesh);

    const gltfLoader = new GLTFLoader();

    let playerMixer = null;
    const playerActions = {};
    let playerBaseAction = null;
    let playerOneShot = null; // { action, until, hold }
    let playerModelReady = false;
    let playerSkeleton = null;
    const playerSkeletons = [];
    let diagBone = null; // ボーンが実際に動いているか計測する対象（腕のボーン）
    const diagPrevQuat = new THREE.Quaternion();
    let diagSampleTimer = 0;
    let diagAngleDeg = 0;
    let diagClipCount = 0;
    let diagTrackCount = 0;
    let diagSource = "loading";

    // 共通のセットアップ。root(Object3D)とclips(AnimationClip[])を受け取る
    function setupCharacter(root, clips) {
      playerMesh.add(root);
      root.traverse((o) => {
        if (o.isSkinnedMesh) {
          o.frustumCulled = false;
          if (!playerSkeleton) playerSkeleton = o.skeleton;
          if (o.skeleton && playerSkeletons.indexOf(o.skeleton) === -1) {
            playerSkeletons.push(o.skeleton);
          }
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m && m.skinning !== true) {
              m.skinning = true;
              m.needsUpdate = true;
            }
          });
        }
      });
      playerMixer = new THREE.AnimationMixer(root);
      clips.forEach((clip) => {
        playerActions[clip.name] = playerMixer.clipAction(clip);
        diagTrackCount += clip.tracks.length;
      });
      diagClipCount = clips.length;
      if (playerSkeleton) {
        diagBone =
          playerSkeleton.bones.find((b) => /UpperArm|LowerArm|Wrist/i.test(b.name)) ||
          playerSkeleton.bones[0];
        if (diagBone) diagPrevQuat.copy(diagBone.quaternion);
      }
      if (playerActions[CLIP.idle]) {
        playerBaseAction = playerActions[CLIP.idle];
        playerBaseAction.play();
      }
      playerModelReady = true;
    }

    function useFallbackCone() {
      const fbGeo = new THREE.ConeGeometry(0.75, 2.1, 4);
      fbGeo.rotateX(Math.PI / 2);
      const fbMesh = new THREE.Mesh(
        fbGeo,
        new THREE.MeshPhongMaterial({
          color: 0x0f1b3a,
          emissive: C.player,
          emissiveIntensity: 0.9,
          shininess: 80,
          flatShading: true,
        })
      );
      fbMesh.position.y = 1.05;
      playerMesh.add(fbMesh);
      diagSource = "fallback";
    }

    // /public/assets/models/player.glb を GLTFLoader で読み込む
    (async () => {
      try {
        const gltf = await new Promise((resolve, reject) => {
          gltfLoader.parse(assets.playerGlb, "", resolve, reject);
        });
        diagSource = "gltf";
        setupCharacter(gltf.scene, gltf.animations);
      } catch (err) {
        console.error("主人公モデルの読み込みに失敗:", err);
        useFallbackCone();
      }
    })();

    function playBase(name) {
      const next = playerActions[name];
      if (!next || playerBaseAction === next) return;
      next.reset();
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
      next.timeScale = 1;
      next.setEffectiveWeight(1);
      next.fadeIn(0.15).play();
      if (playerBaseAction) playerBaseAction.fadeOut(0.15);
      playerBaseAction = next;
    }

    function triggerOneShot(name, timeScale, hold) {
      const action = playerActions[name];
      if (!action) return;
      // 再生中の他のアクションを確実に落とす（混ざるとワンショットのウェイトが薄まる）
      Object.keys(playerActions).forEach((k) => {
        const a = playerActions[k];
        if (a !== action && a.isRunning()) a.fadeOut(0.06);
      });
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = timeScale || 1;
      action.setEffectiveWeight(1);
      action.fadeIn(0.06).play();
      const dur = action.getClip().duration / (timeScale || 1);
      playerOneShot = {
        action,
        until: performance.now() + dur * 1000,
        hold: !!hold,
      };
      // 基本動作は「未設定」に戻す。復帰時に必ずフェードインし直させるため。
      playerBaseAction = null;
    }

    const pAura = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.35, 32),
      new THREE.MeshBasicMaterial({
        color: C.player,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      })
    );
    pAura.rotation.x = -Math.PI / 2;
    pAura.position.y = 0.05;
    scene.add(pAura);

    /* ---------------- boss (GLTFモデル) ---------------- */
    const bossGroup = new THREE.Group();
    bossGroup.scale.setScalar(BOSS_MODEL_SCALE);
    bossGroup.position.set(0, 0, 22);
    scene.add(bossGroup);

    // 予兆や被弾を色で示すため、ボスのマテリアルを全部握っておく
    const bossMats = [];
    let bossMixer = null;
    const bossActions = {};
    let bossBaseAction = null;
    let bossOneShot = null; // { action, until }
    const bossSkeletons = [];
    let bossReady = false;

    let bossBaseTint = STAGES[0].tint;

    // ステージごとにボスの色とサイズを変える
    function applyStageLook() {
      const st = STAGES[G.stage];
      bossBaseTint = st.tint;
      bossGroup.scale.setScalar(st.scale);
      bossLight.color.setHex(st.tint);
      bossAura.material.color.setHex(st.tint);
      setBossTint(st.tint, 0);
    }

    function clearInquisitorFxBeams() {
      for (let i = 0; i < BEAM_COUNT; i++) {
        beams[i].on = false;
        beams[i].live = false;
        beams[i].pivot.visible = false;
        beams[i].mesh.material.opacity = 0;
      }
    }

    function setBossTint(hex, intensity) {
      for (let i = 0; i < bossMats.length; i++) {
        bossMats[i].emissive.setHex(hex);
        bossMats[i].emissiveIntensity = intensity;
      }
    }

    function bossPlayBase(name) {
      const next = bossActions[name];
      if (!next || bossBaseAction === next) return;
      next.reset();
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
      next.timeScale = 1;
      next.setEffectiveWeight(1);
      next.fadeIn(0.18).play();
      if (bossBaseAction) bossBaseAction.fadeOut(0.18);
      bossBaseAction = next;
    }

    function bossOneShotPlay(name, timeScale) {
      const a = bossActions[name];
      if (!a) return;
      Object.keys(bossActions).forEach((k) => {
        const o = bossActions[k];
        if (o !== a && o.isRunning()) o.fadeOut(0.08);
      });
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.timeScale = timeScale || 1;
      a.setEffectiveWeight(1);
      a.fadeIn(0.07).play();
      bossOneShot = {
        action: a,
        until: performance.now() + (a.getClip().duration / (timeScale || 1)) * 1000,
      };
      bossBaseAction = null;
    }

    function useFallbackIcosahedron() {
      const fb = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2.4, 0),
        new THREE.MeshPhongMaterial({
          color: 0x1a0a22,
          emissive: C.boss,
          emissiveIntensity: 0.55,
          flatShading: true,
        })
      );
      fb.position.y = 2.4;
      bossGroup.add(fb);
      bossMats.push(fb.material);
    }

    // /public/assets/models/boss.glb を GLTFLoader で読み込む
    (async () => {
      try {
        const gltf = await new Promise((resolve, reject) => {
          gltfLoader.parse(assets.bossGlb, "", resolve, reject);
        });
        bossGroup.add(gltf.scene);
        gltf.scene.traverse((o) => {
          if (o.isSkinnedMesh) {
            o.frustumCulled = false;
            if (o.skeleton && bossSkeletons.indexOf(o.skeleton) === -1)
              bossSkeletons.push(o.skeleton);
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              if (!m) return;
              m.skinning = true;
              // 暗い配色なので少し発光させて闇に沈まないようにする
              if (m.emissive) {
                m.emissive.setHex(C.boss);
                m.emissiveIntensity = 0;
              }
              m.needsUpdate = true;
              if (bossMats.indexOf(m) === -1) bossMats.push(m);
            });
          }
        });
        bossMixer = new THREE.AnimationMixer(gltf.scene);
        gltf.animations.forEach((c) => {
          bossActions[c.name] = bossMixer.clipAction(c);
        });
        if (bossActions[BCLIP.idle]) {
          bossBaseAction = bossActions[BCLIP.idle];
          bossBaseAction.play();
        }
        bossReady = true;
      } catch (err) {
        console.error("ボスモデルの読み込みに失敗:", err);
        useFallbackIcosahedron();
      }
    })();

    const bossAura = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.8, 40),
      new THREE.MeshBasicMaterial({
        color: C.boss,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      })
    );
    bossAura.rotation.x = -Math.PI / 2;
    bossAura.position.y = 0.06;
    scene.add(bossAura);

    /* ---------------- fx meshes ---------------- */
    const slash = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 6.4, 40, 1, -MELEE_ARC / 2, MELEE_ARC),
      new THREE.MeshBasicMaterial({
        color: C.boss,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      })
    );
    slash.rotation.order = "YXZ"; // 同上（回転順を明示しないと傾く）
    slash.rotation.x = -Math.PI / 2;
    slash.position.y = 0.4;
    scene.add(slash);

    const pSlash = new THREE.Mesh(
      new THREE.RingGeometry(1.2, MELEE_RANGE, 32, 1, -MELEE_ARC / 2, MELEE_ARC),
      new THREE.MeshBasicMaterial({
        color: C.player,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      })
    );
    // 既定のXYZ順だとY回転が先に効いてしまい、板が傾いて地面を貫く。
    // YXZ順にして「寝かせてから向きを変える」順序を保証する。
    pSlash.rotation.order = "YXZ";
    pSlash.rotation.x = -Math.PI / 2;
    pSlash.position.y = 0.45;
    pSlash.visible = false;
    scene.add(pSlash);
    // 斬撃エフェクトは専用タイマーで管理する。
    // 不透明度を状態として読み取ると消えたまま復帰しない不具合が起きるため。
    let pSlashT = 0; // 残り時間
    let pSlashDur = 0.001; // 今回の全体時間
    let pSlashBig = false; // 3段目（大振り）か

    const wave = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 80),
      new THREE.MeshBasicMaterial({
        color: C.parry,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      })
    );
    wave.rotation.x = -Math.PI / 2;
    wave.position.y = 0.3;
    scene.add(wave);

    // 衝撃波の溜めを示すリング（外側から収束してくる）
    const chargeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 72),
      new THREE.MeshBasicMaterial({
        color: C.parry,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      })
    );
    chargeRing.rotation.x = -Math.PI / 2;
    chargeRing.position.y = 0.35;
    chargeRing.visible = false;
    scene.add(chargeRing);

    /* ---- 審問官: 光条（回転レーザー） ---- */
    const beams = [];
    for (let i = 0; i < BEAM_COUNT; i++) {
      const pivot = new THREE.Object3D();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.12, BEAM_LEN),
        new THREE.MeshBasicMaterial({
          color: C.inq,
          transparent: true,
          opacity: 0,
        })
      );
      mesh.position.z = BEAM_LEN / 2;
      pivot.add(mesh);
      pivot.visible = false;
      scene.add(pivot);
      beams.push({ pivot, mesh, on: false, ang: 0, width: 0.2, live: false });
    }

    /* ---- 審問官: 伏火（時間差で爆発する地雷） ---- */
    const mines = [];
    const mineGeo = new THREE.SphereGeometry(0.55, 10, 8);
    const mineRingGeo = new THREE.RingGeometry(0.93, 1.0, 40);
    for (let i = 0; i < MINE_MAX; i++) {
      const core = new THREE.Mesh(
        mineGeo,
        new THREE.MeshBasicMaterial({ color: C.inq })
      );
      const ring = new THREE.Mesh(
        mineRingGeo,
        new THREE.MeshBasicMaterial({
          color: C.inq,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      core.visible = false;
      ring.visible = false;
      scene.add(core);
      scene.add(ring);
      mines.push({ core, ring, alive: false, x: 0, z: 0, t: 0, boom: 0 });
    }
    function spawnMine(x, z, fuse) {
      for (let i = 0; i < MINE_MAX; i++) {
        const m = mines[i];
        if (m.alive) continue;
        m.alive = true;
        m.x = x;
        m.z = z;
        m.t = fuse;
        m.boom = 0;
        m.core.position.set(x, 0.7, z);
        m.ring.position.set(x, 0.08, z);
        m.core.visible = true;
        m.ring.visible = true;
        m.ring.scale.setScalar(MINE_RADIUS);
        m.ring.material.opacity = 0.25;
        return m;
      }
      return null;
    }
    function clearInquisitorFx() {
      for (let i = 0; i < MINE_MAX; i++) {
        mines[i].alive = false;
        mines[i].core.visible = false;
        mines[i].ring.visible = false;
      }
      for (let i = 0; i < BEAM_COUNT; i++) {
        beams[i].on = false;
        beams[i].live = false;
        beams[i].pivot.visible = false;
        beams[i].mesh.material.opacity = 0;
      }
    }

    const parryFx = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 2.4, 40),
      new THREE.MeshBasicMaterial({
        color: C.parry,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      })
    );
    parryFx.rotation.x = -Math.PI / 2;
    parryFx.position.y = 0.5;
    scene.add(parryFx);

    /* ---------------- bullet pool ---------------- */
    const MAXB = 320;
    const bGeoS = new THREE.SphereGeometry(0.32, 8, 6);
    // soft = こちらの射撃で消せる弾（小さい・桃色）
    // hard = 消せない弾（大きい・白）。避けるしかない
    const matSoft = new THREE.MeshBasicMaterial({ color: C.boss });
    const matHard = new THREE.MeshBasicMaterial({ color: C.hard });
    const matPlayer = new THREE.MeshBasicMaterial({ color: C.player });
    const R_SOFT = 0.5;
    const R_HARD = 1.05;
    const bullets = [];
    for (let i = 0; i < MAXB; i++) {
      const m = new THREE.Mesh(bGeoS, matSoft);
      m.visible = false;
      scene.add(m);
      bullets.push({
        mesh: m,
        alive: false,
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        r: 0.4,
        dmg: 1,
        owner: "boss",
        hard: false,
        noSlash: false,
        homing: 0,
        life: 0,
      });
    }
    function spawnBullet(x, z, vx, vz, owner, dmg, hard, noSlash) {
      for (let i = 0; i < MAXB; i++) {
        const b = bullets[i];
        if (b.alive) continue;
        b.alive = true;
        b.x = x;
        b.z = z;
        b.vx = vx;
        b.vz = vz;
        b.owner = owner;
        b.dmg = dmg;
        b.hard = owner === "boss" ? !!hard : false;
        b.noSlash = owner === "boss" ? !!noSlash : false;
        b.homing = 0;
        b.r = owner === "boss" ? (b.hard ? R_HARD : R_SOFT) : 0.32;
        b.life = 7;
        b.mesh.material = owner === "boss" ? (b.hard ? matHard : matSoft) : matPlayer;
        b.mesh.scale.setScalar(b.r / 0.32);
        b.mesh.position.set(x, 1.1, z);
        b.mesh.visible = true;
        return b;
      }
      return null;
    }

    /* ---------------- game state ---------------- */
    const curStage = () => STAGES[G.stage];
    const curPhase = () => STAGES[G.stage].phases[G.phase];
    const G = {
      running: false,
      over: false,
      stage: 0,
      phase: 0,
      timeScale: 1,
      slowT: 0,
      shake: 0,
      hitStop: 0,
      p: {
        x: 0,
        z: -16,
        vx: 0,
        vz: 0,
        face: 0,
        aim: 0,
        hp: PLAYER_HP,
        dash: 0,
        dashCd: 0,
        inv: 0, // 被弾直後の無敵（弾にも有効）
        dashInv: 0, // 回避の無敵（斬撃と衝撃波にのみ有効。弾には効かない）
        hitFlash: 0, // 被弾時の点滅演出。パリィ成功時の無敵では点滅させない
        parry: 0,
        parryCd: 0,
        melee: 0,
        shoot: 0,
        combo: 0,
        comboT: 0,
        hitT: 0, // 命中までの残りタメ時間
        hitStep: 0,
        lungeT: 0, // 斬撃時にわずかに踏み込む残り時間
      },
      b: {
        x: 0,
        z: 22,
        hp: BOSS_HP,
        max: BOSS_HP,
        face: 0,
        think: 1.2,
        stagger: 0,
        staggerMax: 0,
        retX: 0,
        retZ: 1,
        rangedStreak: 0,
        act: null,
        wavePhase: 0,
      },
    };

    function resetPhase(idx) {
      const cfg = STAGES[G.stage].phases[idx];
      G.phase = idx;
      // 相が進むとBGMのテンポと編成が厚くなる
      if (musicRef.current) musicRef.current.setPhase(idx);
      G.b.max = BOSS_HP;
      G.b.hp = Math.round(BOSS_HP * cfg.startFrac);
      G.b.x = 0;
      G.b.z = 22;
      G.b.act = null;
      G.b.think = 1.4;
      G.b.stagger = 0;
      G.b.staggerMax = 0;
      G.b.rangedStreak = 0;
      G.p.x = 0;
      G.p.z = -16;
      G.p.hp = PLAYER_HP;
      G.p.dash = 0;
      G.p.dashCd = 0;
      G.p.inv = 0.8;
      G.p.dashInv = 0;
      G.p.hitFlash = 0;
      G.p.parry = 0;
      G.p.parryCd = 0;
      G.p.combo = 0;
      G.p.comboT = 0;
      G.p.hitT = 0;
      G.p.hitStep = 0;
      G.p.lungeT = 0;
      G.p.melee = 0;
      G.p.shoot = 0;
      pSlash.scale.setScalar(1);
      pSlash.material.opacity = 0;
      pSlash.visible = false;
      pSlashT = 0;
      for (let i = 0; i < MAXB; i++) {
        bullets[i].alive = false;
        bullets[i].mesh.visible = false;
      }
      // 前の試合の残りカスを消す（衝撃波が残っていると即死する）
      G.b.wavePhase = 0;
      wave.material.opacity = 0;
      chargeRing.visible = false;
      chargeRing.material.opacity = 0;
      clearInquisitorFx();
      bossGroup.scale.setScalar(STAGES[G.stage].scale);
      slash.material.opacity = 0;
      pSlash.material.opacity = 0;
      parryFx.material.opacity = 0;
      setBossTint(bossBaseTint, 0);
      G.shake = 0;
      G.slowT = 0;
      G.timeScale = 1;
      G.hitStop = 0;
      input.sx = 0;
      input.sz = 0;
      input.kx = 0;
      input.kz = 0;
      input.shoot = false;
      input.slash = false;
      input.dash = false;
      input.parry = false;
      bossOneShot = null;
      if (bossReady && bossActions[BCLIP.idle]) {
        Object.keys(bossActions).forEach((k) => bossActions[k].stop());
        bossBaseAction = bossActions[BCLIP.idle];
        bossBaseAction.reset();
        bossBaseAction.setLoop(THREE.LoopRepeat, Infinity);
        bossBaseAction.clampWhenFinished = false;
        bossBaseAction.timeScale = 1;
        bossBaseAction.setEffectiveWeight(1);
        bossBaseAction.play();
      }
      setBossTint(bossBaseTint, 0);
      playerOneShot = null;
      if (playerModelReady && playerActions[CLIP.idle]) {
        // 死亡ポーズなどが残らないよう、全アクションを完全に停止してから戻す
        Object.keys(playerActions).forEach((k) => playerActions[k].stop());
        playerBaseAction = playerActions[CLIP.idle];
        playerBaseAction.reset();
        playerBaseAction.setLoop(THREE.LoopRepeat, Infinity);
        playerBaseAction.clampWhenFinished = false;
        playerBaseAction.timeScale = 1;
        playerBaseAction.setEffectiveWeight(1);
        playerBaseAction.play();
      }
      G.over = false;
      G.running = true;
    }

    /* ---------------- input ---------------- */
    const input = {
      sx: 0, // タッチスティック（押しっぱなしで保持される）
      sz: 0,
      kx: 0, // キーボード（毎フレーム再計算）
      kz: 0,
      shoot: false,
      shootHeld: false, // 構え/射撃アニメ用の持続状態（フレーム消費されるinput.shootと別管理）
      slash: false,
      dash: false,
      parry: false,
    };
    const keys = {};
    const onKeyDown = (e) => {
      keys[e.code] = true;
      if (e.code === "Space") input.dash = true;
      if (e.code === "KeyJ") input.slash = true;
      if (e.code === "KeyK") input.parry = true;
    };
    const onKeyUp = (e) => (keys[e.code] = false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function pollKeys() {
      let x = 0,
        z = 0;
      if (keys["KeyW"] || keys["ArrowUp"]) z += 1;
      if (keys["KeyS"] || keys["ArrowDown"]) z -= 1;
      if (keys["KeyA"] || keys["ArrowLeft"]) x -= 1;
      if (keys["KeyD"] || keys["ArrowRight"]) x += 1;
      if (x || z) {
        const l = Math.hypot(x, z);
        input.kx = x / l;
        input.kz = z / l;
      } else {
        input.kx = 0;
        input.kz = 0;
      }
      if (keys["KeyL"]) input.shoot = true;
    }

    /* ---------------- helpers ---------------- */
    const clampArena = (o, pad) => {
      const d = Math.hypot(o.x, o.z);
      const lim = ARENA_R - (pad || 1);
      if (d > lim) {
        o.x = (o.x / d) * lim;
        o.z = (o.z / d) * lim;
      }
    };
    const angTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
    const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
    const flash = (color, a) => {
      if (!flashRef.current) return;
      flashRef.current.style.background = color;
      flashRef.current.style.opacity = String(a);
    };

    function damageBoss(amount) {
      const mult = G.b.stagger > 0 ? 2 : 1;
      G.b.hp -= amount * mult;
      if (G.b.hp < 0) G.b.hp = 0;

      // HPの割合が閾値をまたいだら、戦闘を止めずにその場でPhase（攻撃パターン）を切り替える
      if (G.b.hp > 0) {
        const nextPhase = phaseIndexForFrac(G.b.hp / G.b.max);
        if (nextPhase !== G.phase) {
          G.phase = nextPhase;
          setBanner(STAGES[G.stage].phases[nextPhase].name);
          setTimeout(() => setBanner(null), 1400);
        }
      }

      if (G.b.hp <= 0) {
        G.b.hp = 0;
        G.running = false;
        G.over = true;
        bossOneShotPlay(BCLIP.death, 1);
        if (bossOneShot) bossOneShot.until = performance.now() + 999999; // 倒れた姿勢を保つ
        markCleared(G.stage);
        if (G.stage >= STAGES.length - 1) {
          setScreen("clear");
        } else {
          // ステージ突破 → 新しいボスへ。ボスが切り替わってからバナーを出す
          const ns = G.stage + 1;
          setTimeout(() => {
            G.stage = ns;
            applyStageLook();
            resetPhase(0);
            setTimeout(() => {
              setBanner(STAGES[ns].phases[0].name);
              setTimeout(() => setBanner(null), 1400);
            }, 500);
          }, 2200);
        }
      }
    }

    // dodgeable: true なら回避の無敵でも防げる（斬撃・衝撃波）。
    // 弾は false で呼ぶため、回避ではすり抜けられない。
    function hurtPlayer(n, dodgeable) {
      if (G.p.inv > 0 || G.over) return;
      if (dodgeable && G.p.dashInv > 0) return;
      G.p.hp -= n;
      G.p.inv = HIT_IFRAME;
      G.p.hitFlash = HIT_IFRAME;
      G.shake = 0.7;
      flash("#ff2e6e", 0.5);
      if (G.p.hp <= 0) {
        G.p.hp = 0;
        G.running = false;
        G.over = true;
        triggerOneShot(CLIP.death, 1, true);
        setScreen("dead");
      } else {
        triggerOneShot(CLIP.hit, 1, false);
      }
    }

    function onParrySuccess(hard) {
      G.p.parry = 0;
      // 直後の追撃で被弾しないよう猶予を与える（崩し成功時はさらに長め）
      G.p.inv = Math.max(G.p.inv, hard ? PARRY_IFRAME * 1.6 : PARRY_IFRAME);
      G.slowT = hard ? 0.5 : 0.32;
      G.shake = 0.5;
      flash("#ffd84d", 0.55);
      if (musicRef.current) musicRef.current.playSfx("parry2");
      parryFx.position.set(G.p.x, 0.5, G.p.z);
      parryFx.material.opacity = 1;
      parryFx.scale.setScalar(0.6);
      // パリィは弾に対しては一切効かない。ボスの斬撃を受け止めた時だけ成立する
      if (hard) {
        G.b.stagger = 1.1;
        G.b.staggerMax = 1.1;
        G.b.act = null;
        damageBoss(4);
      }
    }

    /* ---------------- boss AI ---------------- */
    function chooseInquisitor() {
      const d = dist(G.b.x, G.b.z, G.p.x, G.p.z);
      const cfg = curPhase();
      // 近づかれたら瞬間移動で仕切り直す
      if (d < 9 && Math.random() < 0.6) return { t: "blink", s: 0, timer: 0.3, k: 0 };
      if (Math.random() < cfg.melee) return { t: "blink", s: 0, timer: 0.3, k: 0 };
      const r = Math.random();
      if (G.phase === 0) {
        return r < 0.62
          ? { t: "beam", s: 0, timer: 0.75, k: 0, a: Math.random() * 6.28, dir: Math.random() < 0.5 ? 1 : -1 }
          : { t: "homing", s: 0, timer: 0.35, k: 0 };
      }
      if (G.phase === 1) {
        if (r < 0.38) return { t: "mines", s: 0, timer: 0.45, k: 0 };
        if (r < 0.72) return { t: "homing", s: 0, timer: 0.35, k: 0 };
        return { t: "beam", s: 0, timer: 0.75, k: 0, a: Math.random() * 6.28, dir: Math.random() < 0.5 ? 1 : -1 };
      }
      if (r < 0.3) return { t: "mines", s: 0, timer: 0.4, k: 0 };
      if (r < 0.58) return { t: "beam", s: 0, timer: 0.65, k: 0, a: Math.random() * 6.28, dir: Math.random() < 0.5 ? 1 : -1 };
      if (r < 0.82) return { t: "homing", s: 0, timer: 0.3, k: 0 };
      return { t: "blink", s: 0, timer: 0.28, k: 0 };
    }

    function chooseAction() {
      if (curStage().kit === "inquisitor") return chooseInquisitor();
      const cfg = curPhase();
      const d = dist(G.b.x, G.b.z, G.p.x, G.p.z);
      let meleeChance = cfg.melee;
      // 第一相は弾幕主体の相なので、接近を強制する補正を弱める
      const nearFloor = G.phase === 0 ? 0.5 : 0.9;
      const streakFloor = G.phase === 0 ? 0.45 : 0.8;
      const streakLimit = G.phase === 0 ? 3 : 2;
      // 既に近いなら撃たずに斬りにいく
      if (d < 12) meleeChance = Math.max(meleeChance, nearFloor);
      // 遠距離攻撃を続けた直後は接近を優先し、撃ちっぱなしを防ぐ
      if (G.b.rangedStreak >= streakLimit) meleeChance = Math.max(meleeChance, streakFloor);
      const wantMelee = Math.random() < meleeChance;
      G.b.rangedStreak = wantMelee ? 0 : G.b.rangedStreak + 1;
      if (wantMelee) {
        // 遠い間合いから連続斬りを始めても追いつけないので突進を選ぶ
        if (d > 15) return { t: "rush", s: 0, timer: 0.7 };
        return Math.random() < 0.45
          ? { t: "combo", s: 0, k: 0, timer: 0.55 }
          : { t: "rush", s: 0, timer: 0.7 };
      }
      const r = Math.random();
      if (G.phase >= 2 && r < 0.18) return { t: "heavy", s: 0, timer: 0.5, k: 0 };
      if (r < 0.3) return { t: "ring", s: 0, timer: 0.45, k: 0 };
      if (r < 0.58) return { t: "aimed", s: 0, timer: 0.35, k: 0 };
      if (r < 0.82) return { t: "spiral", s: 0, timer: 2.0, a: Math.random() * 6 };
      return { t: "wave", s: 0, timer: WAVE_CHARGE, k: 0 };
    }

    function bossUpdate(dt) {
      const cfg = curPhase();
      const sp = cfg.speed;
      const dToP = dist(G.b.x, G.b.z, G.p.x, G.p.z);
      let faceA = angTo(G.b.x, G.b.z, G.p.x, G.p.z);
      // 離脱中だけは逃げる方向を向く（後ろ向きに走って見えないように）
      if (G.b.act && G.b.act.t === "retreat") {
        faceA = Math.atan2(G.b.retX, G.b.retZ);
      }
      G.b.face += Math.atan2(Math.sin(faceA - G.b.face), Math.cos(faceA - G.b.face)) * Math.min(1, dt * 6);

      if (G.b.stagger > 0) {
        if (G.b.stagger === G.b.staggerMax) bossOneShotPlay(BCLIP.hit, 0.7);
        G.b.stagger -= dt;
        if (G.b.stagger <= 0) {
          // 立ち直った直後は、その場で殴られ続けないよう距離を取る
          G.b.stagger = 0;
          const away = angTo(G.p.x, G.p.z, G.b.x, G.b.z);
          G.b.retX = Math.sin(away);
          G.b.retZ = Math.cos(away);
          G.b.act = { t: "retreat", s: 0, timer: BOSS_RETREAT_TIME, k: 0 };
          // Roll(1.33s)を離脱時間に合わせて再生する
          bossOneShotPlay(BCLIP.dodge, 1.33 / BOSS_RETREAT_TIME);
        }
        return;
      }

      if (!G.b.act) {
        // 間合い調整
        // 近接率が高い相ほど近づいて構える
        const want = 6 + (1 - cfg.melee) * 13;
        const diff = dToP - want;
        const mv = Math.sign(diff) * Math.min(Math.abs(diff), 1) * 7 * sp;
        G.b.x += Math.sin(faceA) * mv * dt;
        G.b.z += Math.cos(faceA) * mv * dt;
        // 横移動
        G.b.x += Math.cos(faceA) * Math.sin(performance.now() * 0.0009) * 5 * dt;
        G.b.z -= Math.sin(faceA) * Math.sin(performance.now() * 0.0009) * 5 * dt;
        clampArena(G.b, 3);
        if (!bossOneShot) bossPlayBase(Math.abs(mv) > 1.2 ? BCLIP.run : BCLIP.idle);
        G.b.think -= dt * sp;
        if (G.b.think <= 0) {
          G.b.act = chooseAction();
          // rush・combo・blink は選ばれた瞬間にパリィ可能な攻撃が確定するため、
          // 予兆の見た目より前、選択された直後に警告音を鳴らして早めに知らせる
          if (
            G.b.act &&
            (G.b.act.t === "rush" || G.b.act.t === "combo" || G.b.act.t === "blink")
          ) {
            if (musicRef.current) musicRef.current.playSfx("enemyDanger");
          }
        }
        return;
      }

      const A = G.b.act;
      A.timer -= dt * sp;

      if (A.t === "ring") {
        if (A.timer <= 0) {
          const n = 16 + G.phase * 4;
          const off = Math.random() * Math.PI;
          // 2巡目以降は消せない弾を混ぜる（第一相は全て消せる弾）
          const hardVolley = G.phase >= 1 && A.k % 2 === 1;
          for (let i = 0; i < n; i++) {
            const a = off + (i / n) * Math.PI * 2;
            const hard = hardVolley && i % 4 === 0;
            const sp2 = hard ? 8 : 11;
            spawnBullet(G.b.x, G.b.z, Math.sin(a) * sp2, Math.cos(a) * sp2, "boss", 1, hard);
          }
          bossOneShotPlay(BCLIP.shoot, 1.6);
          A.k++;
          A.timer = 0.5;
          if (A.k >= (G.phase >= 2 ? 3 : 2)) endAct(0.75);
        }
      } else if (A.t === "aimed") {
        if (A.timer <= 0) {
          const a = angTo(G.b.x, G.b.z, G.p.x, G.p.z);
          // 3発目だけ消せない重い弾（第二相以降）
          const hard = G.phase >= 1 && A.k === 2;
          for (let i = -1; i <= 1; i++) {
            const aa = a + i * (hard ? 0.2 : 0.13);
            const sp2 = hard ? 14 : 19;
            spawnBullet(G.b.x, G.b.z, Math.sin(aa) * sp2, Math.cos(aa) * sp2, "boss", 1, hard);
          }
          if (A.k === 0) bossOneShotPlay(BCLIP.shoot, 1.4);
          A.k++;
          A.timer = 0.26;
          if (A.k >= 4) endAct(0.6);
        }
      } else if (A.t === "spiral") {
        A.a += dt * 4.6 * sp;
        A.s -= dt;
        if (A.s <= 0) {
          A.s = 0.07;
          for (let i = 0; i < 2; i++) {
            const a = A.a + i * Math.PI;
            spawnBullet(G.b.x, G.b.z, Math.sin(a) * 13, Math.cos(a) * 13, "boss", 1, false);
          }
        }
        if (A.timer <= 0) endAct(0.7);
      } else if (A.t === "heavy") {
        // 消せない大玉を扇状に撃つ（終相のみ）
        if (A.timer <= 0) {
          const a = angTo(G.b.x, G.b.z, G.p.x, G.p.z);
          for (let i = -1; i <= 1; i++) {
            const aa = a + i * 0.3;
            spawnBullet(G.b.x, G.b.z, Math.sin(aa) * 12, Math.cos(aa) * 12, "boss", 1, true);
          }
          bossOneShotPlay(BCLIP.shoot, 1.2);
          A.k++;
          A.timer = 0.55;
          if (A.k >= 2) endAct(0.9);
        }
      } else if (A.t === "wave") {
        if (A.s === 0) {
          // --- 溜め ---
          if (!A.k) {
            A.k = 1;
            // 溜め終わりとモーションの終わりが一致するよう再生速度を合わせる
            const clip = bossActions[BCLIP.wave];
            const d = clip ? clip.getClip().duration : WAVE_CHARGE;
            bossOneShotPlay(BCLIP.wave, d / WAVE_CHARGE);
          }
          setBossTint(C.parry, 0.1 + 0.15 * (1 - A.timer / WAVE_CHARGE));
          const k = Math.max(0, A.timer / WAVE_CHARGE); // 1 → 0
          chargeRing.visible = true;
          chargeRing.position.set(G.b.x, 0.35, G.b.z);
          chargeRing.scale.setScalar(2.2 + k * 13); // 外から内へ収束
          chargeRing.material.opacity = 0.3 + (1 - k) * 0.7;
          if (A.timer <= 0) {
            // --- 発動 ---
            A.s = 1;
            A.timer = 1.1;
            chargeRing.visible = false;
            chargeRing.material.opacity = 0;
            setBossTint(bossBaseTint, 0);
            G.shake = Math.max(G.shake, 0.6);
            wave.position.set(G.b.x, 0.3, G.b.z);
            wave.material.opacity = 0.9;
            wave.scale.setScalar(2);
            G.b.wavePhase = 1;
          }
        } else if (A.s === 1 && A.timer <= 0) {
          endAct(0.6);
        }
      } else if (A.t === "beam") {
        // --- 光条: 予兆の細い線 → 太い光条が回転する ---
        const arms = G.phase >= 2 ? 3 : 2;
        if (A.s === 0) {
          setBossTint(C.parry, 0.2);
          bossPlayBase(BCLIP.ready);
          for (let i = 0; i < arms; i++) {
            const b = beams[i];
            b.on = true;
            b.live = false;
            b.ang = A.a + (i / arms) * Math.PI * 2;
            b.pivot.visible = true;
            b.pivot.position.set(G.b.x, 1.1, G.b.z);
            b.pivot.rotation.y = b.ang;
            b.mesh.scale.x = 0.18;
            b.mesh.material.opacity = 0.5;
          }
          if (A.timer <= 0) {
            A.s = 1;
            A.timer = G.phase >= 2 ? 2.4 : 2.0;
            bossOneShotPlay(BCLIP.shoot, 1.1);
            G.shake = Math.max(G.shake, 0.4);
          }
        } else if (A.s === 1) {
          A.a += dt * (G.phase >= 2 ? 2.2 : 2.0) * A.dir * sp; // 歩きだけでは避けきれない速さ。回避ステップ推奨
          for (let i = 0; i < arms; i++) {
            const b = beams[i];
            b.live = true;
            b.ang = A.a + (i / arms) * Math.PI * 2;
            b.width = 1.1;
            b.pivot.position.set(G.b.x, 1.1, G.b.z);
            b.pivot.rotation.y = b.ang;
            b.mesh.scale.x = 1.1;
            b.mesh.material.opacity = 0.8;
          }
          if (A.timer <= 0) {
            clearInquisitorFxBeams();
            setBossTint(bossBaseTint, 0);
            endAct(0.8);
          }
        }
      } else if (A.t === "mines") {
        // --- 伏火: 主人公の周囲に時間差の地雷を撒く ---
        if (A.timer <= 0) {
          const n = 3; // 終相でも撒く数は増やさない（多すぎるとの声に合わせて据え置き）
          for (let i = 0; i < n; i++) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 3 + Math.random() * 12;
            spawnMine(
              G.p.x + Math.sin(ang) * rad,
              G.p.z + Math.cos(ang) * rad,
              MINE_FUSE + Math.random() * 0.35
            );
          }
          bossOneShotPlay(BCLIP.wave, 1.5);
          A.k++;
          A.timer = 0.55;
          if (A.k >= 2) endAct(G.phase >= 2 ? 0.95 : 0.7);
        }
      } else if (A.t === "homing") {
        // --- 追尾弾: 遅いが追ってくる。撃ち落とせる ---
        if (A.timer <= 0) {
          const n = 2; // 全体的に多いとの声を受けて削減
          const base = angTo(G.b.x, G.b.z, G.p.x, G.p.z);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.55;
            const b = spawnBullet(G.b.x, G.b.z, Math.sin(a) * 9, Math.cos(a) * 9, "boss", 1, false, true);
            if (b) b.homing = 1.9;
          }
          bossOneShotPlay(BCLIP.shoot, 1.4);
          A.k++;
          A.timer = 0.5;
          if (A.k >= 2) endAct(G.phase >= 2 ? 0.9 : 0.65);
        }
      } else if (A.t === "blink") {
        // --- 瞬間移動して斬る ---
        if (A.s === 0) {
          const k = Math.max(0, A.timer / 0.3);
          bossGroup.scale.setScalar(curStage().scale * k);
          if (A.timer <= 0) {
            parryFx.position.set(G.b.x, 1.0, G.b.z);
            parryFx.material.color.setHex(C.inq);
            parryFx.material.opacity = 0.9;
            parryFx.scale.setScalar(1.5);
            const ang = Math.random() * Math.PI * 2;
            G.b.x = G.p.x + Math.sin(ang) * 6.5;
            G.b.z = G.p.z + Math.cos(ang) * 6.5;
            clampArena(G.b, 3);
            G.b.face = angTo(G.b.x, G.b.z, G.p.x, G.p.z);
            A.s = 1;
            A.timer = 0.42;
          }
        } else if (A.s === 1) {
          const k = 1 - Math.max(0, A.timer / 0.42);
          bossGroup.scale.setScalar(curStage().scale * Math.min(1, k * 1.6));
          setBossTint(C.parry, 0.22);
          bossPlayBase(BCLIP.ready);
          if (A.timer <= 0) {
            A.s = 2;
            A.timer = 0.14;
            bossSwingAnim(A.k);
          }
        } else if (A.s === 2) {
          if (A.timer <= 0) {
            bossSwingHit();
            A.s = 3;
            A.timer = 0.25;
          }
        } else if (A.timer <= 0) {
          bossGroup.scale.setScalar(curStage().scale);
          setBossTint(bossBaseTint, 0);
          A.k++;
          if (G.phase >= 2 && A.k < 2) {
            A.s = 0;
            A.timer = 0.3;
            // 2撃目もパリィ可能。再びテレポートに入る瞬間に早めの警告音
            if (musicRef.current) musicRef.current.playSfx("enemyDanger");
          } else {
            endAct(0.75);
          }
        }
      } else if (A.t === "retreat") {
        // 主人公から遠ざかる。壁際では横に滑って逃げ場を作る
        let vx = G.b.retX;
        let vz = G.b.retZ;
        const edge = Math.hypot(G.b.x, G.b.z);
        if (edge > ARENA_R - 6) {
          const tx = -G.b.z / (edge || 1);
          const tz = G.b.x / (edge || 1);
          vx = vx * 0.35 + tx * 0.9;
          vz = vz * 0.35 + tz * 0.9;
          const l = Math.hypot(vx, vz) || 1;
          vx /= l;
          vz /= l;
          G.b.retX = vx;
          G.b.retZ = vz;
        }
        G.b.x += vx * BOSS_RETREAT_SPEED * sp * dt;
        G.b.z += vz * BOSS_RETREAT_SPEED * sp * dt;
        clampArena(G.b, 3);
        if (A.timer <= 0) endAct(0.35);
      } else if (A.t === "rush") {
        if (A.s === 0) {
          setBossTint(C.parry, 0.2);
          bossPlayBase(BCLIP.ready);
          // 溜めの間はわずかに後ろへ引く（踏み込みの助走に見せる）
          const pull = Math.min(1, A.timer / 0.3) * 4.5;
          G.b.x -= Math.sin(faceA) * pull * dt;
          G.b.z -= Math.cos(faceA) * pull * dt;
          clampArena(G.b, 3);
          if (A.timer <= 0) {
            A.s = 1;
            // 距離に応じた踏み込み時間。上限を短くして「一息に詰める」感触にする
            const need = Math.max(0, dToP - RUSH_STOP);
            A.timer = Math.min(0.42, Math.max(0.1, need / RUSH_SPEED));
            bossPlayBase(BCLIP.run);
            A.dx = Math.sin(G.b.face);
            A.dz = Math.cos(G.b.face);
            G.shake = Math.max(G.shake, 0.35); // 踏み込みの衝撃
          }
        } else if (A.s === 1) {
          // 突進中もわずかに軌道を補正する（棒立ちで避けられないように）
          const ax = Math.sin(faceA);
          const az = Math.cos(faceA);
          const t = Math.min(1, dt * RUSH_HOMING);
          A.dx += (ax - A.dx) * t;
          A.dz += (az - A.dz) * t;
          const l = Math.hypot(A.dx, A.dz) || 1;
          A.dx /= l;
          A.dz /= l;
          G.b.x += A.dx * RUSH_SPEED * sp * dt;
          G.b.z += A.dz * RUSH_SPEED * sp * dt;
          clampArena(G.b, 3);
          // 間合いに入ったら即座に振る（通り過ぎないように）
          const nowD = dist(G.b.x, G.b.z, G.p.x, G.p.z);
          if (A.timer <= 0 || nowD < RUSH_STOP) {
            A.s = 2;
            A.timer = 0.1;
            doBossSwing();
          }
        } else if (A.timer <= 0) {
          setBossTint(bossBaseTint, 0);
          endAct(0.75);
        }
      } else if (A.t === "combo") {
        if (A.s === 0) {
          // --- 構え。主人公より速く詰めないと永久に追いつけない ---
          setBossTint(C.parry, 0.2);
          bossPlayBase(BCLIP.ready);
          if (dToP > COMBO_HOLD) {
            const mv = Math.min(dToP - COMBO_HOLD, 1) * COMBO_APPROACH * sp;
            G.b.x += Math.sin(faceA) * mv * dt;
            G.b.z += Math.cos(faceA) * mv * dt;
            clampArena(G.b, 3);
          }
          if (A.timer <= 0) {
            // --- 踏み込みながら振る ---
            A.s = 1;
            A.timer = COMBO_LUNGE;
            bossSwingAnim(A.k);
            const need = Math.max(0, dToP - COMBO_HOLD);
            A.lspd = Math.min(need / COMBO_LUNGE, 55);
            A.lx = Math.sin(faceA);
            A.lz = Math.cos(faceA);
          }
        } else if (A.s === 1) {
          // 主人公へ向けて軌道を補正しながら踏み込む（追尾）。
          // 間合いに入ったら足を止め、通り抜け（貫通）しないようにする
          const homingA = angTo(G.b.x, G.b.z, G.p.x, G.p.z);
          const t = Math.min(1, dt * COMBO_HOMING);
          A.lx += (Math.sin(homingA) - A.lx) * t;
          A.lz += (Math.cos(homingA) - A.lz) * t;
          const ll = Math.hypot(A.lx, A.lz) || 1;
          A.lx /= ll;
          A.lz /= ll;
          if (dist(G.b.x, G.b.z, G.p.x, G.p.z) > COMBO_HOLD) {
            G.b.x += A.lx * A.lspd * sp * dt;
            G.b.z += A.lz * A.lspd * sp * dt;
            clampArena(G.b, 3);
          }
          if (A.timer <= 0) {
            bossSwingHit(); // 踏み込み切ってから判定
            A.s = 2;
            A.timer = 0.12;
          }
        } else if (A.s === 2 && A.timer <= 0) {
          A.k++;
          if (A.k >= 3) {
            setBossTint(bossBaseTint, 0);
            endAct(0.95);
          } else {
            A.s = 0;
            A.timer = 0.42;
            // 次の一振りの構え＝パリィ可能な予兆に入るタイミングで警告音
            if (musicRef.current) musicRef.current.playSfx("enemyDanger");
          }
        }
      }
    }

    function endAct(cool) {
      G.b.act = null;
      G.b.think = cool;
      setBossTint(bossBaseTint, 0);
    }

    const BOSS_SWING_CLIPS = [BCLIP.slash, BCLIP.slash2, BCLIP.slash3];

    function bossSwingAnim(variant) {
      bossOneShotPlay(BOSS_SWING_CLIPS[(variant || 0) % 3], 1.5);
    }

    // 命中判定。踏み込みが終わった瞬間に呼ぶ
    function bossSwingHit() {
      slash.position.set(G.b.x, 0.4, G.b.z);
      slash.rotation.y = G.b.face - Math.PI / 2;
      slash.material.opacity = 0.85;
      const d = dist(G.b.x, G.b.z, G.p.x, G.p.z);
      const a = angTo(G.b.x, G.b.z, G.p.x, G.p.z);
      const diff = Math.abs(Math.atan2(Math.sin(a - G.b.face), Math.cos(a - G.b.face)));
      if (d < BOSS_SWING_RANGE && diff < MELEE_ARC / 2 + 0.25) {
        if (G.p.parry > 0) onParrySuccess(true);
        else hurtPlayer(1, true);
      }
      G.shake = Math.max(G.shake, 0.35);
    }

    function doBossSwing(variant) {
      bossSwingAnim(variant);
      bossSwingHit();
    }

    /* ---------------- player ---------------- */
    function playerUpdate(dt, camF) {
      const P = G.p;
      P.dashCd -= dt;
      P.parryCd -= dt;
      P.melee -= dt;
      P.comboT -= dt;
      if (P.comboT <= 0) P.combo = 0;
      P.shoot -= dt;
      P.inv -= dt;
      P.dashInv -= dt;
      P.hitFlash -= dt;
      if (P.parry > 0) P.parry -= dt;

      // カメラ前方 f と、その画面右 r = cross(f, up)
      const fx = Math.sin(camF),
        fz = Math.cos(camF);
      const rx = -Math.cos(camF),
        rz = Math.sin(camF);
      let ix = input.sx + input.kx;
      let iz = input.sz + input.kz;
      const il = Math.hypot(ix, iz);
      if (il > 1) {
        ix /= il;
        iz /= il;
      }
      const mvx = fx * iz + rx * ix;
      const mvz = fz * iz + rz * ix;
      const mag = Math.hypot(mvx, mvz);
      P.moveMag = mag;

      if (P.dash > 0) {
        P.dash -= dt;
        P.x += P.vx * dt;
        P.z += P.vz * dt;
      } else {
        if (mag > 0.05) {
          P.x += (mvx / mag) * PLAYER_SPEED * mag * dt;
          P.z += (mvz / mag) * PLAYER_SPEED * mag * dt;
        }
        // 斬撃中はボスへ向けてわずかに踏み込む。近づきすぎ（貫通）は防ぐ
        if (P.lungeT > 0) {
          P.lungeT -= dt;
          if (dist(P.x, P.z, G.b.x, G.b.z) > SLASH_LUNGE_STOP) {
            const la = angTo(P.x, P.z, G.b.x, G.b.z);
            P.x += Math.sin(la) * SLASH_LUNGE_SPEED * dt;
            P.z += Math.cos(la) * SLASH_LUNGE_SPEED * dt;
          }
        }
      }
      clampArena(P, 1.2);

      // 攻撃の狙いは常にボス方向（自動照準）
      P.aim = angTo(P.x, P.z, G.b.x, G.b.z);

      // 見た目の向き。移動中は移動方向、それ以外はボスの方を向く。
      // 攻撃・パリィ中はボスを向かせて、当たり判定と絵を一致させる。
      let faceTarget;
      if (P.melee > 0 || P.parry > 0 || P.aiming) {
        faceTarget = P.aim;
      } else if (P.dash > 0) {
        faceTarget = Math.atan2(P.vx, P.vz);
      } else if (mag > 0.05) {
        faceTarget = Math.atan2(mvx, mvz);
      } else {
        faceTarget = P.aim;
      }
      // 急に向きが飛ばないよう補間する
      const faceDiff = Math.atan2(
        Math.sin(faceTarget - P.face),
        Math.cos(faceTarget - P.face)
      );
      P.face += faceDiff * Math.min(1, dt * 16);

      if (input.dash && P.dashCd <= 0 && P.dash <= 0) {
        const dx = mag > 0.05 ? mvx / mag : Math.sin(P.aim + Math.PI);
        const dz = mag > 0.05 ? mvz / mag : Math.cos(P.aim + Math.PI);
        P.vx = dx * DASH_SPEED;
        P.vz = dz * DASH_SPEED;
        P.dash = DASH_TIME;
        P.dashInv = Math.max(P.dashInv, DASH_IFRAME);
        P.dashCd = DASH_CD;
        triggerOneShot(CLIP.dodge, 3.6, false); // 1.33s のクリップを約0.37sに圧縮（硬直短縮に合わせる）
        if (musicRef.current) musicRef.current.playSfx("dash", 1, 2); // 素材を2倍速で再生
      }
      input.dash = false;

      if (input.parry && P.parryCd <= 0) {
        P.parry = PARRY_WINDOW;
        P.parryCd = PARRY_CD;
        triggerOneShot(CLIP.parry, 2.4, false); // 0.83s を約0.35sに圧縮
        if (musicRef.current) musicRef.current.playSfx("parry");
        parryFx.position.set(P.x, 0.5, P.z);
        parryFx.material.opacity = 0.45;
        parryFx.scale.setScalar(1);
      }
      input.parry = false;

      if (input.slash && P.melee <= 0) {
        // 連撃猶予内なら次の段へ、切れていたら1段目から
        P.combo = P.comboT > 0 ? P.combo + 1 : 1;
        if (P.combo > COMBO.length) P.combo = 1;
        P.comboT = COMBO_WINDOW;
        const step = COMBO[P.combo - 1];
        P.melee = step.cd;
        triggerOneShot(step.clip, step.ts, false);
        // 振りかぶってから当たる。命中判定はタメ後にまとめて処理する
        P.hitT = step.windup;
        P.hitStep = P.combo;
        P.lungeT = step.windup + 0.06; // タメ〜命中の間だけ踏み込む
      }
      input.slash = false;

      // --- タメが終わった瞬間に命中処理 ---
      if (P.hitT > 0) {
        P.hitT -= dt;
        if (P.hitT <= 0) {
          const step = COMBO[P.hitStep - 1];
          const big = P.hitStep === COMBO.length;
          if (musicRef.current && step.sfx) musicRef.current.playSfx(step.sfx);
          pSlash.position.set(P.x, 0.45, P.z);
          pSlash.rotation.y = P.aim - Math.PI / 2; // 斬撃は常にボス方向へ
          pSlashBig = big;
          pSlashDur = big ? 0.3 : 0.24;
          pSlashT = pSlashDur;
          const d = dist(P.x, P.z, G.b.x, G.b.z);
          if (d < MELEE_RANGE + 2.2) {
            damageBoss(step.dmg);
            G.hitStop = big ? 0.12 : 0.07;
            G.shake = Math.max(G.shake, big ? 0.6 : 0.35);
          }
          // 斬撃も「消せる弾」だけを払える。消せない弾や斬撃無効の弾は残る
          for (let i = 0; i < MAXB; i++) {
            const b = bullets[i];
            if (!b.alive || b.owner !== "boss" || b.hard || b.noSlash) continue;
            if (dist(b.x, b.z, P.x, P.z) < MELEE_RANGE) {
              b.alive = false;
              b.mesh.visible = false;
            }
          }
        }
      }

      P.aiming = !!keys["KeyL"] || input.shootHeld;
      if (input.shoot && P.shoot <= 0) {
        P.shoot = SHOOT_CD;
        const a = P.aim + (Math.random() - 0.5) * 0.06; // 弾は常にボスへ自動照準
        spawnBullet(
          P.x + Math.sin(a) * 1.2,
          P.z + Math.cos(a) * 1.2,
          Math.sin(a) * BSPEED,
          Math.cos(a) * BSPEED,
          "player",
          SHOOT_DMG
        );
        if (musicRef.current) musicRef.current.playSfx("shoot");
      }
      input.shoot = false;
    }

    /* ---------------- bullets ---------------- */
    function bulletsUpdate(dt) {
      for (let i = 0; i < MAXB; i++) {
        const b = bullets[i];
        if (!b.alive) continue;
        if (b.homing > 0) {
          // ゆっくり主人公の方へ曲がる
          const a = angTo(b.x, b.z, G.p.x, G.p.z);
          const sp0 = Math.hypot(b.vx, b.vz) || 1;
          const t = Math.min(1, dt * b.homing);
          b.vx += (Math.sin(a) * sp0 - b.vx) * t;
          b.vz += (Math.cos(a) * sp0 - b.vz) * t;
        }
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.life -= dt;
        b.mesh.position.set(b.x, 1.1, b.z);
        if (b.life <= 0 || Math.hypot(b.x, b.z) > ARENA_R + 3) {
          b.alive = false;
          b.mesh.visible = false;
          continue;
        }
        if (b.owner === "boss") {
          const d = dist(b.x, b.z, G.p.x, G.p.z);
          if (d < b.r + 0.95) {
            // 回避の無敵もパリィも弾には効かない。被弾直後の無敵中だけすり抜ける
            if (G.p.inv <= 0) {
              b.alive = false;
              b.mesh.visible = false;
              hurtPlayer(b.dmg);
            }
          }
        } else {
          // 自機の弾 → ボス本体
          if (dist(b.x, b.z, G.b.x, G.b.z) < b.r + 2.3) {
            b.alive = false;
            b.mesh.visible = false;
            damageBoss(b.dmg);
            continue;
          }
          // 自機の弾 → 敵弾（消せる弾のみ相殺）
          for (let j = 0; j < MAXB; j++) {
            const e = bullets[j];
            if (!e.alive || e.owner !== "boss" || e.hard) continue;
            if (dist(b.x, b.z, e.x, e.z) < b.r + e.r) {
              e.alive = false;
              e.mesh.visible = false;
              b.alive = false;
              b.mesh.visible = false;
              break;
            }
          }
        }
      }
    }

    /* ---------------- loop ---------------- */
    let raf = 0;
    let last = performance.now();
    const camPos = new THREE.Vector3(0, 12, -18);
    const camLook = new THREE.Vector3(0, 1.5, 0);
    let camF = 0;

    function tick(now) {
      raf = requestAnimationFrame(tick);
      let dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (G.slowT > 0) {
        G.slowT -= dt;
        G.timeScale = 0.32;
      } else {
        G.timeScale += (1 - G.timeScale) * Math.min(1, dt * 5);
      }
      if (G.hitStop > 0) {
        G.hitStop -= dt;
        dt = 0;
      }
      const sdt = dt * G.timeScale;

      if (G.running) {
        pollKeys();
        playerUpdate(sdt, camF);
        bossUpdate(sdt);
        bulletsUpdate(sdt);
      }

      // 衝撃波判定
      if (wave.material.opacity > 0) {
        // フィールド端まで届くよう、速度と寿命を確保する
        wave.scale.setScalar(wave.scale.x + sdt * WAVE_SPEED);
        wave.material.opacity -= sdt * WAVE_FADE;
        if (G.b.wavePhase === 1 && G.running) {
          const rr = wave.scale.x;
          const dp = dist(G.b.x, G.b.z, G.p.x, G.p.z);
          if (Math.abs(dp - rr) < 1.1) {
            G.b.wavePhase = 0;
            hurtPlayer(1, true);
          }
        }
        if (wave.material.opacity <= 0 || wave.scale.x > ARENA_R * 2 + 4) {
          wave.material.opacity = 0;
          G.b.wavePhase = 0;
        }
      }

      /* --- 審問官: 光条の当たり判定 --- */
      for (let i = 0; i < BEAM_COUNT; i++) {
        const bm = beams[i];
        if (!bm.on || !bm.live || !G.running) continue;
        const dx = G.p.x - G.b.x;
        const dz = G.p.z - G.b.z;
        const sn = Math.sin(bm.ang);
        const cs = Math.cos(bm.ang);
        const along = dx * sn + dz * cs; // 光条に沿った距離
        const side = dx * cs - dz * sn; // 光条からの横ずれ
        if (along > 1.5 && along < BEAM_LEN && Math.abs(side) < bm.width * 0.5 + 0.9) {
          hurtPlayer(1, true);
        }
      }

      /* --- 審問官: 伏火の起爆 --- */
      for (let i = 0; i < MINE_MAX; i++) {
        const m = mines[i];
        if (!m.alive) continue;
        if (m.boom > 0) {
          // 爆発中
          m.boom -= dt;
          const k = Math.max(0, m.boom / 0.32);
          m.ring.scale.setScalar(MINE_RADIUS * (1.15 - k * 0.15));
          m.ring.material.opacity = k * 0.9;
          m.core.visible = false;
          if (m.boom <= 0) {
            m.alive = false;
            m.ring.visible = false;
          }
          continue;
        }
        m.t -= sdt;
        const warn = Math.max(0, m.t / MINE_FUSE);
        m.ring.scale.setScalar(MINE_RADIUS * (0.35 + (1 - warn) * 0.65));
        m.ring.material.opacity = 0.25 + (1 - warn) * 0.5;
        m.core.position.y = 0.7 + Math.sin(now * 0.012) * 0.15;
        m.core.material.color.setHex(warn < 0.3 ? C.parry : C.inq);
        m.ring.material.color.setHex(warn < 0.3 ? C.parry : C.inq);
        if (m.t <= 0) {
          m.boom = 0.32;
          m.ring.material.opacity = 0.9;
          G.shake = Math.max(G.shake, 0.35);
          if (G.running && dist(m.x, m.z, G.p.x, G.p.z) < MINE_RADIUS) {
            hurtPlayer(1, true);
          }
        }
      }

      // fx 減衰
      slash.material.opacity = Math.max(0, slash.material.opacity - dt * 4);
      // 斬撃エフェクト（タイマー駆動。広がりながら消える）
      if (pSlashT > 0) {
        pSlashT -= dt;
        const k = Math.max(0, pSlashT / pSlashDur); // 1 → 0
        pSlash.visible = true;
        pSlash.material.opacity = pSlashBig ? k : k * 0.85;
        const s = (pSlashBig ? 1.35 : 1.1) - k * 0.35; // 内から外へ広がる
        pSlash.scale.setScalar(s);
        if (pSlashT <= 0) {
          pSlashT = 0;
          pSlash.visible = false;
          pSlash.material.opacity = 0;
          pSlash.scale.setScalar(1);
        }
      }
      if (parryFx.material.opacity > 0) {
        parryFx.scale.setScalar(parryFx.scale.x + dt * 7);
        parryFx.material.opacity = Math.max(0, parryFx.material.opacity - dt * 2.2);
        if (parryFx.material.opacity <= 0) parryFx.scale.setScalar(1);
      }
      if (flashRef.current) {
        const cur = parseFloat(flashRef.current.style.opacity || "0");
        if (cur > 0) flashRef.current.style.opacity = String(Math.max(0, cur - dt * 2.4));
      }

      /* --- transforms --- */
      playerMesh.position.set(G.p.x, 0, G.p.z);
      playerMesh.rotation.y = G.p.face + PLAYER_MODEL_FACING_OFFSET;
      pAura.position.set(G.p.x, 0.05, G.p.z);
      // 被弾直後だけ本体を点滅させて示す（モデルはPBRマテリアルなので発光値ではなく可視/不可視で表現）。
      // パリィ成功時の無敵（G.p.inv）では点滅させない。
      playerMesh.visible = G.p.hitFlash > 0 ? Math.sin(now * 0.03) > -0.2 : true;
      pAura.material.color.setHex(G.p.parry > 0 ? C.parry : C.player);
      pAura.material.opacity = G.p.parry > 0 ? 0.9 : 0.3;

      /* --- プレイヤーのアニメーション状態制御 --- */
      if (playerModelReady) {
        if (playerOneShot && !playerOneShot.hold && performance.now() >= playerOneShot.until) {
          playerOneShot.action.fadeOut(0.12);
          playerOneShot = null;
        }
        if (!playerOneShot) {
          const moving = G.p.moveMag > 0.05 || G.p.dash > 0;
          if (G.p.aiming) playBase(moving ? CLIP.aimRun : CLIP.aimIdle);
          else if (moving) playBase(CLIP.run);
          else playBase(CLIP.idle);
        }
        if (playerMixer) playerMixer.update(sdt);

        // ボーンのワールド行列を確定させてから、スケルトンを明示的に更新する。
        // (レンダラー任せにするとバージョンによって更新されずbind poseのまま描画される)
        playerMesh.updateMatrixWorld(true);
        for (let si = 0; si < playerSkeletons.length; si++) {
          playerSkeletons[si].update();
        }

        // 診断: 一定間隔でサンプリングし、ボーンの回転角(度)を実測する
        diagSampleTimer += dt;
        if (diagBone && diagSampleTimer >= 0.3) {
          const dq = Math.min(1, Math.abs(diagBone.quaternion.dot(diagPrevQuat)));
          diagAngleDeg = (2 * Math.acos(dq) * 180) / Math.PI;
          diagPrevQuat.copy(diagBone.quaternion);
          diagSampleTimer = 0;
        }
      }

      bossGroup.position.set(G.b.x, 0, G.b.z);
      bossGroup.rotation.y = G.b.face;

      /* --- ボスのアニメーション --- */
      if (bossReady) {
        if (bossOneShot && performance.now() >= bossOneShot.until) {
          bossOneShot.action.fadeOut(0.14);
          bossOneShot = null;
        }
        if (bossMixer) bossMixer.update(sdt);
        bossGroup.updateMatrixWorld(true);
        for (let si = 0; si < bossSkeletons.length; si++) bossSkeletons[si].update();
      }
      const st = G.b.stagger > 0;
      bossAura.position.set(G.b.x, 0.06, G.b.z);
      bossAura.material.color.setHex(st ? C.parry : bossBaseTint);
      // 殻を消したので、崩し中は足元のリングを強調して攻撃機会を示す
      bossAura.material.opacity = st ? 0.85 : 0.4;
      bossAura.scale.setScalar(st ? 1.25 : 1);
      bossLight.position.set(G.b.x, 4, G.b.z);

      /* --- camera: プレイヤー後方からボスを収める --- */
      const dx = G.b.x - G.p.x,
        dz = G.b.z - G.p.z;
      const dl = Math.hypot(dx, dz) || 1;
      camF = Math.atan2(dx / dl, dz / dl);
      const back = 13 + Math.min(dl * 0.35, 16);
      const tx = G.p.x - (dx / dl) * back;
      const tz = G.p.z - (dz / dl) * back;
      camPos.lerp(new THREE.Vector3(tx, 9.5 + Math.min(dl * 0.16, 11), tz), Math.min(1, dt * 4.5));
      camLook.lerp(
        new THREE.Vector3(G.p.x * 0.35 + G.b.x * 0.65, 2.2, G.p.z * 0.35 + G.b.z * 0.65),
        Math.min(1, dt * 5)
      );
      camera.position.copy(camPos);
      if (G.shake > 0) {
        G.shake = Math.max(0, G.shake - dt * 2.2);
        camera.position.x += (Math.random() - 0.5) * G.shake;
        camera.position.y += (Math.random() - 0.5) * G.shake;
      }
      camera.lookAt(camLook);

      /* --- HUD --- */
      if (bossFill.current) {
        bossFill.current.style.width = (G.b.hp / G.b.max) * 100 + "%";
        bossFill.current.style.background = st ? "#ffd84d" : "#ff2e6e";
      }
      if (bossLabel.current) {
        bossLabel.current.textContent =
          curStage().name + " / " + curPhase().name + "  " + Math.ceil(G.b.hp) + " / " + G.b.max;
      }
      for (let i = 0; i < PLAYER_HP; i++) {
        const el = heartRefs[i].current;
        if (!el) continue;
        const on = i < G.p.hp;
        el.style.background = on ? "#7ff7e8" : "transparent";
        el.style.opacity = on ? "1" : "0.28";
      }
      if (dashRing.current)
        dashRing.current.style.opacity = G.p.dashCd > 0 ? "0.3" : "1";
      if (parryRing.current)
        parryRing.current.style.opacity = G.p.parryCd > 0 ? "0.3" : "1";

      if (diagRef.current) {
        const animOk = diagAngleDeg > 0.2;
        const act = playerBaseAction;
        diagRef.current.textContent =
          (playerModelReady ? "MDL:" + diagSource : "MDL:" + diagSource) +
          " CLIP:" + diagClipCount +
          " TRK:" + diagTrackCount +
          " " + (diagBone ? diagBone.name : "-") +
          " ROT:" + diagAngleDeg.toFixed(2) + "d" +
          (act
            ? " T:" + act.time.toFixed(2) + " W:" + act.getEffectiveWeight().toFixed(2) +
              " " + act.getClip().name
            : " ACT:none");
        diagRef.current.style.color = animOk ? "#7ff7e8" : "#ff2e6e";
      }

      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      if (!mount.clientWidth) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    apiRef.current = {
      input,
      start: () => {
        G.stage = 0;
        applyStageLook();
        resetPhase(0);
        setBanner(STAGES[0].phases[0].name);
        setTimeout(() => setBanner(null), 1400);
      },
      // テストプレイ用: 指定したステージ・Phaseから開始する
      startAt: (stageIdx, phaseIdx) => {
        G.stage = stageIdx;
        applyStageLook();
        resetPhase(phaseIdx);
        setBanner(STAGES[stageIdx].phases[phaseIdx].name);
        setTimeout(() => setBanner(null), 1400);
      },
      retry: () => {
        resetPhase(G.phase);
      },
      restart: () => {
        G.stage = 0;
        applyStageLook();
        resetPhase(0);
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.dispose();
      if (renderer.domElement.parentNode)
        renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [assets]);

  /* ---------------- touch controls ---------------- */
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const stickId = useRef(null);
  const stickOrigin = useRef({ x: 0, y: 0 });
  const holdShoot = useRef(false);
  const shootId = useRef(null);

  const stickStart = (e) => {
    stickId.current = e.pointerId;
    const r = stickRef.current.getBoundingClientRect();
    stickOrigin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (err) {
      /* 捕捉できなくても window の pointerup で復帰する */
    }
  };
  const stickMove = (e) => {
    if (stickId.current !== e.pointerId) return;
    const dx = e.clientX - stickOrigin.current.x;
    const dy = e.clientY - stickOrigin.current.y;
    const R = 52;
    const l = Math.hypot(dx, dy);
    const k = l > R ? R / l : 1;
    const kx = dx * k,
      ky = dy * k;
    if (knobRef.current)
      knobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
    const api = apiRef.current;
    if (api) {
      api.input.sx = kx / R;
      api.input.sz = -ky / R;
    }
  };
  const releaseStick = () => {
    stickId.current = null;
    if (knobRef.current) knobRef.current.style.transform = "translate(0px,0px)";
    const api = apiRef.current;
    if (api) {
      api.input.sx = 0;
      api.input.sz = 0;
    }
  };
  const stickEnd = (e) => {
    if (stickId.current !== e.pointerId) return;
    releaseStick();
  };

  // 画面が切り替わる瞬間に指が乗っていると pointerup を取り逃がすので、
  // window 側と画面遷移の両方で必ず解放する
  useEffect(() => {
    const onUp = (e) => {
      if (stickId.current === e.pointerId) releaseStick();
      if (shootId.current === e.pointerId) {
        holdShoot.current = false;
        if (apiRef.current) apiRef.current.input.shootHeld = false;
        shootId.current = null;
      }
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(() => {
    releaseStick();
    holdShoot.current = false;
    if (apiRef.current) apiRef.current.input.shootHeld = false;
    // 戦闘中以外はBGMを絞る
    if (musicRef.current) musicRef.current.setActive(screen === "play");
  }, [screen]);

  useEffect(() => {
    if (musicRef.current) musicRef.current.setMuted(!musicOn);
  }, [musicOn]);

  useEffect(() => {
    return () => {
      if (musicRef.current) {
        musicRef.current.dispose();
        musicRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (holdShoot.current && apiRef.current) apiRef.current.input.shoot = true;
    }, 60);
    return () => clearInterval(id);
  }, []);

  const press = (name) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      if (!apiRef.current) return;
      if (name === "shoot") {
        holdShoot.current = true;
        apiRef.current.input.shootHeld = true;
        shootId.current = e.pointerId;
        try {
          e.target.setPointerCapture(e.pointerId);
        } catch (err) {}
      } else {
        apiRef.current.input[name] = true;
      }
    },
    onPointerUp: (e) => {
      if (name === "shoot" && shootId.current === e.pointerId) {
        holdShoot.current = false;
        if (apiRef.current) apiRef.current.input.shootHeld = false;
        shootId.current = null;
      }
    },
    onPointerCancel: () => {
      if (name === "shoot") {
        holdShoot.current = false;
        if (apiRef.current) apiRef.current.input.shootHeld = false;
        shootId.current = null;
      }
    },
  });

  const btn = (bg, size) => ({
    width: size,
    height: size,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: size > 70 ? 22 : 17,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "#EDE6FF",
    background: bg,
    border: "1px solid rgba(237,230,255,0.35)",
    userSelect: "none",
    touchAction: "none",
    backdropFilter: "blur(2px)",
  });

  const start = () => {
    // 音声はユーザー操作をきっかけにしか開始できないため、ここで初期化する
    if (!musicRef.current) {
      try {
        musicRef.current = createMusic(assets);
      } catch (e) {
        musicRef.current = null;
      }
    }
    if (musicRef.current) {
      musicRef.current.setMuted(!musicOn);
      musicRef.current.setPhase(0);
      musicRef.current.start();
    }
    setScreen("play");
    apiRef.current && apiRef.current.start();
  };

  // テストプレイ用: 指定したステージ・Phaseから直接開始する
  const startAt = (stageIdx, phaseIdx) => {
    if (!musicRef.current) {
      try {
        musicRef.current = createMusic(assets);
      } catch (e) {
        musicRef.current = null;
      }
    }
    if (musicRef.current) {
      musicRef.current.setMuted(!musicOn);
      musicRef.current.setPhase(phaseIdx);
      musicRef.current.start();
    }
    setScreen("play");
    apiRef.current && apiRef.current.startAt(stageIdx, phaseIdx);
  };

  return (
    <div
      className="fd-root"
      style={{
        position: "relative",
        width: "100%",
        background: "#0b0620",
        overflow: "hidden",
        fontFamily:
          "'Hiragino Sans','Noto Sans JP',system-ui,-apple-system,sans-serif",
        color: "#EDE6FF",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      <div
        ref={flashRef}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          pointerEvents: "none",
          mixBlendMode: "screen",
        }}
      />

      {/* ---- BGM オンオフ ---- */}
      <div
        onClick={() => setMusicOn((v) => !v)}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: "1px solid rgba(237,230,255,0.3)",
          background: musicOn ? "rgba(108,76,255,0.3)" : "rgba(237,230,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          opacity: musicOn ? 1 : 0.45,
          zIndex: 5,
        }}
      >
        {musicOn ? "♪" : "♪̸"}
      </div>

      {/* ---- テストプレイ用: ステージセレクトへの入口（いつでも開ける。クリア状況に関係なく全開放） ---- */}
      <div
        onClick={() => setScreen("testSelect")}
        style={{
          position: "absolute",
          top: screen === "play" ? 96 : 14,
          left: 14,
          padding: "8px 14px",
          border: "1px solid rgba(237,230,255,0.3)",
          borderRadius: 6,
          background: "rgba(237,230,255,0.06)",
          fontSize: 11,
          letterSpacing: "0.15em",
          opacity: 0.8,
          zIndex: 5,
        }}
      >
        ステージセレクト
      </div>

      {/* ---- 診断表示（原因切り分け用。解決したら消す） ---- */}
      <div
        ref={diagRef}
        style={{
          position: "absolute",
          bottom: 4,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 10,
          fontFamily: "ui-monospace,monospace",
          letterSpacing: "0.06em",
          pointerEvents: "none",
          opacity: 0.85,
        }}
      />

      {/* ---- HUD 上部 ---- */}
      {screen === "play" && (
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 20,
            right: 20,
            pointerEvents: "none",
          }}
        >
          <div
            ref={bossLabel}
            style={{
              fontSize: 11,
              letterSpacing: "0.28em",
              opacity: 0.75,
              marginBottom: 6,
              fontVariantNumeric: "tabular-nums",
            }}
          />
          <div
            style={{
              height: 7,
              background: "rgba(237,230,255,0.12)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              ref={bossFill}
              style={{
                height: "100%",
                width: "100%",
                background: "#ff2e6e",
                transition: "width 90ms linear",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {[0, 1, 2].map((p, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 2,
                  background: "rgba(237,230,255,0.25)",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---- 体力 ---- */}
      {screen === "play" && (
        <div
          style={{
            position: "absolute",
            top: 74,
            left: 20,
            display: "flex",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          {heartRefs.slice(0, PLAYER_HP).map((r, i) => (
            <div
              key={i}
              ref={r}
              style={{
                width: 22,
                height: 6,
                background: "#7ff7e8",
                border: "1px solid rgba(127,247,232,0.6)",
              }}
            />
          ))}
        </div>
      )}

      {/* ---- タッチ操作 ---- */}
      {screen === "play" && (
        <>
          <div
            ref={stickRef}
            onPointerDown={stickStart}
            onPointerMove={stickMove}
            onPointerUp={stickEnd}
            onPointerCancel={stickEnd}
            style={{
              position: "absolute",
              left: 24,
              bottom: "calc(66px + env(safe-area-inset-bottom, 0px))",
              width: 132,
              height: 132,
              borderRadius: "50%",
              border: "1px solid rgba(237,230,255,0.2)",
              background: "rgba(237,230,255,0.05)",
              touchAction: "none",
            }}
          >
            <div
              ref={knobRef}
              style={{
                position: "absolute",
                left: 41,
                top: 41,
                width: 50,
                height: 50,
                borderRadius: "50%",
                background: "rgba(127,247,232,0.3)",
                border: "1px solid rgba(127,247,232,0.7)",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* 十字配置。親指が届きやすいよう、よく使う斬/避を内側かつ下寄りにする。
              各ボタンは中心へ寄せて配置し、ボタン同士の間隔を詰めている */}
          <div
            style={{
              position: "absolute",
              right: 18,
              bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
              width: 206,
              height: 206,
            }}
          >
            {/* 上: 射撃 */}
            <div style={{ position: "absolute", left: 68, top: 14 }}>
              <div {...press("shoot")} style={btn("rgba(127,247,232,0.22)", 70)}>
                撃
              </div>
            </div>
            {/* 左: 斬撃 */}
            <div style={{ position: "absolute", left: 14, top: 66 }}>
              <div {...press("slash")} style={btn("rgba(255,46,110,0.30)", 74)}>
                斬
              </div>
            </div>
            {/* 右: パリィ */}
            <div style={{ position: "absolute", left: 122, top: 66 }}>
              <div {...press("parry")} style={btn("rgba(255,216,77,0.28)", 70)}>
                受
              </div>
            </div>
            {/* 下: 回避 */}
            <div style={{ position: "absolute", left: 68, top: 122 }}>
              <div {...press("dash")} style={btn("rgba(108,76,255,0.35)", 70)}>
                避
              </div>
            </div>
          </div>
        </>
      )}

      {/* ---- バナー ---- */}
      {banner && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            opacity: bannerShow ? 1 : 0,
            transition: "opacity 500ms ease",
          }}
        >
          <div style={{ fontSize: 46, fontWeight: 300, letterSpacing: "0.3em" }}>
            {banner}
          </div>
        </div>
      )}

      {/* ---- 読込 / タイトル / ステージセレクト / 死亡 / クリア ---- */}
      {screen !== "play" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: screen === "dead" || screen === "stageSelect" ? "#000000" : "rgba(11,6,32,0.82)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 28,
            textAlign: "center",
            overflowY: "auto",
            touchAction: "auto",
          }}
        >
          {screen === "loading" && (
            <div style={{ touchAction: "auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  fontSize: 46,
                  fontWeight: 200,
                  letterSpacing: "0.18em",
                  lineHeight: 1.1,
                }}
              >
                F-DUEL
              </div>
              <div
                style={{
                  marginTop: 26,
                  fontSize: 13,
                  lineHeight: 2,
                  opacity: 0.8,
                  maxWidth: 340,
                }}
              >
                {loadErr ? "素材の読み込みに失敗しました" : "素材を読み込んでいます"}
              </div>
              {loadMsg && !loadErr && (
                <div style={{ marginTop: 18, fontSize: 12, letterSpacing: "0.2em", opacity: 0.75 }}>
                  {loadMsg}…
                </div>
              )}
              {loadErr && (
                <div
                  style={{
                    marginTop: 18,
                    fontSize: 12,
                    lineHeight: 1.8,
                    color: "#ff2e6e",
                    maxWidth: 320,
                  }}
                >
                  {loadErr}
                </div>
              )}
            </div>
          )}
          {screen === "title" && (
            <>
              <div
                style={{
                  fontSize: 52,
                  fontWeight: 200,
                  letterSpacing: "0.18em",
                  lineHeight: 1.1,
                }}
              >
                F-DUEL
              </div>
              <div
                style={{
                  marginTop: 26,
                  fontSize: 13,
                  lineHeight: 2,
                  opacity: 0.8,
                  maxWidth: 340,
                }}
              >
                左スティックで移動。<b>撃</b>で射撃、<b>斬</b>で接近斬り。
                <br />
                <b>避</b>は無敵回避。<b>受</b>は弾を撃ち返し、
                <br />
                斬撃に合わせれば相手を崩す。
              </div>
              <div
                onClick={start}
                onPointerDown={() => setStartPressed(true)}
                onPointerUp={() => setStartPressed(false)}
                onPointerLeave={() => setStartPressed(false)}
                onPointerCancel={() => setStartPressed(false)}
                style={{
                  marginTop: 34,
                  padding: "14px 44px",
                  border: "1px solid rgba(237,230,255,0.5)",
                  letterSpacing: "0.3em",
                  fontSize: 14,
                  background: startPressed ? "rgba(237,230,255,0.22)" : "transparent",
                  transform: startPressed ? "scale(0.94)" : "scale(1)",
                  transition: "transform 90ms ease, background 90ms ease",
                }}
              >
                開始
              </div>
            </>
          )}
          {screen === "stageSelect" && (
            <div style={{ touchAction: "auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 200,
                  letterSpacing: "0.2em",
                  marginBottom: 22,
                }}
              >
                ステージセレクト
              </div>
              {clearedBosses.size === 0 ? (
                <div style={{ fontSize: 12, letterSpacing: "0.1em", opacity: 0.6 }}>
                  まだ倒したボスがいません
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  {STAGES.map((st, si) =>
                    clearedBosses.has(si) ? (
                      <div
                        key={si}
                        onClick={() => startAt(si, 0)}
                        style={{
                          padding: "8px 16px",
                          border: "1px solid rgba(237,230,255,0.3)",
                          fontSize: 12,
                          letterSpacing: "0.1em",
                          opacity: 0.8,
                        }}
                      >
                        {st.name}
                      </div>
                    ) : null
                  )}
                </div>
              )}
              <div
                onClick={() => setScreen("dead")}
                style={{
                  marginTop: 30,
                  fontSize: 12,
                  letterSpacing: "0.2em",
                  opacity: 0.6,
                }}
              >
                戻る
              </div>
            </div>
          )}
          {screen === "testSelect" && (
            <div style={{ touchAction: "auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 200,
                  letterSpacing: "0.2em",
                  marginBottom: 22,
                }}
              >
                テストプレイ：ステージ選択
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                {STAGES.map((st, si) => (
                  <div key={si} style={{ display: "flex", gap: 8 }}>
                    {st.phases.map((ph, pi) => (
                      <div
                        key={pi}
                        onClick={() => startAt(si, pi)}
                        style={{
                          padding: "8px 16px",
                          border: "1px solid rgba(237,230,255,0.3)",
                          fontSize: 12,
                          letterSpacing: "0.1em",
                          opacity: 0.8,
                        }}
                      >
                        {st.name} {ph.name}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div
                onClick={() => setScreen("title")}
                style={{
                  marginTop: 30,
                  fontSize: 12,
                  letterSpacing: "0.2em",
                  opacity: 0.6,
                }}
              >
                戻る
              </div>
            </div>
          )}
          {screen === "dead" && (
            <>
              <div
                onClick={() => {
                  setScreen("play");
                  apiRef.current && apiRef.current.retry();
                }}
                style={{
                  padding: "14px 44px",
                  border: "1px solid rgba(237,230,255,0.5)",
                  letterSpacing: "0.3em",
                  fontSize: 14,
                }}
              >
                Continue
              </div>
              <div
                onClick={() => setScreen("stageSelect")}
                style={{
                  marginTop: 16,
                  padding: "14px 44px",
                  border: "1px solid rgba(237,230,255,0.3)",
                  letterSpacing: "0.3em",
                  fontSize: 14,
                  opacity: 0.8,
                }}
              >
                ステージセレクト
              </div>
            </>
          )}
          {screen === "clear" && (
            <>
              <div style={{ fontSize: 44, fontWeight: 200, letterSpacing: "0.22em" }}>
                撃破
              </div>
              <div
                onClick={() => {
                  setScreen("play");
                  apiRef.current && apiRef.current.restart();
                }}
                style={{
                  marginTop: 30,
                  padding: "14px 44px",
                  border: "1px solid rgba(237,230,255,0.5)",
                  letterSpacing: "0.3em",
                  fontSize: 14,
                }}
              >
                最初から
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
