/**
 * Anatomical human heart — anterior view.
 *
 * Color biology:
 *  • LEFT side (oxygenated, arterial) → vivid red  #e74c3c / #c0392b
 *  • RIGHT side (deoxygenated, venous) → dark blue-red  #3d5494 / #6d1e28
 *  • Aorta → bright arterial red
 *  • Pulmonary trunk → venous blue-purple
 *  • SVC → deep venous blue
 *  • Pulmonary veins → oxygenated red (back from lungs → left atrium)
 *
 * Vessels rendered as 3D cylinders:
 *  - body  = filled path with perpendicular light→shadow gradient
 *  - rim   = thin highlight on the lit edge, shadow on the dark edge
 *  - lumen = foreshortened ellipse at the cut end showing interior
 */
export default function HeartAnatomy({ className = '', style = {} }) {
  return (
    <svg
      viewBox="0 0 300 330"
      className={className}
      style={style}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Anatomical human heart"
    >
      <defs>
        {/* ── Left ventricle — oxygenated ── */}
        <radialGradient id="ha-lv" cx="34%" cy="30%" r="66%">
          <stop offset="0%"   stopColor="#e74c3c" />
          <stop offset="32%"  stopColor="#c0392b" />
          <stop offset="68%"  stopColor="#922b21" />
          <stop offset="100%" stopColor="#4a0e0e" />
        </radialGradient>

        {/* ── Right ventricle — deoxygenated, darker, blue-tinted ── */}
        <radialGradient id="ha-rv" cx="72%" cy="28%" r="54%">
          <stop offset="0%"   stopColor="#8e2232" />
          <stop offset="50%"  stopColor="#62162a" />
          <stop offset="100%" stopColor="#320818" />
        </radialGradient>

        {/* ── Right atrium — venous ── */}
        <radialGradient id="ha-ra" cx="55%" cy="38%" r="55%">
          <stop offset="0%"   stopColor="#7a1e30" />
          <stop offset="100%" stopColor="#380a18" />
        </radialGradient>

        {/* ── AORTA cylinder — bright arterial red (L→R = lit→shadow) ── */}
        <linearGradient id="ha-ao-body" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#f2968a" />   {/* specular */}
          <stop offset="14%"  stopColor="#e74c3c" />
          <stop offset="60%"  stopColor="#c0392b" />
          <stop offset="100%" stopColor="#6b1212" />   {/* deep shadow */}
        </linearGradient>
        <radialGradient id="ha-ao-lumen" cx="38%" cy="45%" r="62%">
          <stop offset="0%"   stopColor="#6b0a0a" />
          <stop offset="100%" stopColor="#280303" />
        </radialGradient>

        {/* ── PULMONARY TRUNK cylinder — deoxygenated venous blue ── */}
        <linearGradient id="ha-pt-body" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#8fa8d8" />   {/* highlight */}
          <stop offset="18%"  stopColor="#4a68b8" />
          <stop offset="62%"  stopColor="#2c3f8e" />
          <stop offset="100%" stopColor="#111b52" />   {/* shadow */}
        </linearGradient>
        <radialGradient id="ha-pt-lumen" cx="36%" cy="45%" r="62%">
          <stop offset="0%"   stopColor="#0c1438" />
          <stop offset="100%" stopColor="#040820" />
        </radialGradient>

        {/* ── Left PA cylinder (same colour as pulm trunk) ── */}
        <linearGradient id="ha-lpa-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#8fa8d8" />
          <stop offset="20%"  stopColor="#4a68b8" />
          <stop offset="70%"  stopColor="#2c3f8e" />
          <stop offset="100%" stopColor="#111b52" />
        </linearGradient>

        {/* ── SVC cylinder — deep venous blue ── */}
        <linearGradient id="ha-svc-body" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#7a9acc" />   {/* highlight */}
          <stop offset="20%"  stopColor="#3d5898" />
          <stop offset="65%"  stopColor="#243070" />
          <stop offset="100%" stopColor="#0e1445" />   {/* shadow */}
        </linearGradient>
        <radialGradient id="ha-svc-lumen" cx="35%" cy="45%" r="60%">
          <stop offset="0%"   stopColor="#0a1030" />
          <stop offset="100%" stopColor="#03060e" />
        </radialGradient>

        {/* ── Pulmonary veins (red, carry O₂ blood from lungs → LA) ── */}
        <linearGradient id="ha-pv-body" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#e08070" />
          <stop offset="30%"  stopColor="#c0392b" />
          <stop offset="100%" stopColor="#6e1414" />
        </linearGradient>

        {/* ── Specular sheen over heart body ── */}
        <radialGradient id="ha-spec" cx="32%" cy="25%" r="52%">
          <stop offset="0%"   stopColor="rgba(255,205,195,0.23)" />
          <stop offset="55%"  stopColor="rgba(255,155,145,0.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>

        {/* ── Drop shadow ── */}
        <filter id="ha-shadow" x="-15%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="10" stdDeviation="14"
            floodColor="#4a0000" floodOpacity="0.72" />
        </filter>

        {/* ── Subtle glow on coronary vessels ── */}
        <filter id="ha-coro-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.8" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* ── Ambient glow behind heart ── */}
      <ellipse cx="148" cy="190" rx="110" ry="120" fill="#8b0000" opacity="0.11"/>
      <ellipse cx="148" cy="190" rx="75"  ry="82"  fill="#a00000" opacity="0.07"/>

      {/* ════════════════════════════════════════
          POSTERIOR STRUCTURES (painted first)
      ════════════════════════════════════════ */}

      {/* Left atrium — partially visible top-left, reddish (O₂ blood) */}
      <path d="M 114 98 C 102 83, 90 62, 94 44
               C 98 28, 110 24, 120 32
               C 128 40, 126 58, 120 75
               C 116 87, 114 95, 114 98 Z"
        fill="#6e1c1c" />

      {/* ── PULMONARY VEINS — two red tubes entering left atrium from left ──
          Superior left PV (upper) */}
      {/* Body */}
      <path d="M 74 62 C 62 54, 54 42, 58 30
               C 62 20, 74 20, 78 30
               C 82 40, 78 54, 74 62 Z"
        fill="url(#ha-pv-body)" opacity="0.85"/>
      {/* Highlight edge */}
      <path d="M 62 54 C 57 46, 55 36, 58 28"
        stroke="rgba(240,180,160,0.38)" strokeWidth="2" strokeLinecap="round"/>
      {/* Lumen at cut end */}
      <ellipse cx="66" cy="27" rx="6" ry="2.5"
        fill="#4a0a0a" transform="rotate(-15,66,27)"/>
      <ellipse cx="66" cy="27" rx="6" ry="2.5"
        stroke="rgba(160,50,40,0.55)" strokeWidth="0.7"
        fill="none" transform="rotate(-15,66,27)"/>

      {/* Inferior left PV (lower) */}
      <path d="M 66 92 C 52 84, 46 70, 52 56
               C 58 44, 70 46, 72 57
               C 74 68, 70 82, 66 92 Z"
        fill="url(#ha-pv-body)" opacity="0.72"/>
      <path d="M 53 84 C 47 74, 47 62, 52 54"
        stroke="rgba(240,180,160,0.3)" strokeWidth="1.8" strokeLinecap="round"/>
      <ellipse cx="52" cy="53" rx="5" ry="2.2"
        fill="#4a0a0a" transform="rotate(-8,52,53)"/>
      <ellipse cx="52" cy="53" rx="5" ry="2.2"
        stroke="rgba(160,50,40,0.5)" strokeWidth="0.7"
        fill="none" transform="rotate(-8,52,53)"/>

      {/* ════════════════════════════════════════
          MAIN HEART BODY
      ════════════════════════════════════════ */}

      {/* LEFT VENTRICLE — oxygenated, bright red (dominant) */}
      <path
        d="M 148 77
           C 112 68, 74 90, 68 134
           C 62 178, 80 218, 104 248
           C 122 270, 138 286, 148 294
           C 158 286, 174 270, 192 248
           C 216 218, 234 178, 228 134
           C 222 90, 184 68, 148 77 Z"
        fill="url(#ha-lv)"
        filter="url(#ha-shadow)"
      />

      {/* RIGHT VENTRICLE — deoxygenated, darker with blue-red hue */}
      <path
        d="M 163 83
           C 190 78, 220 102, 226 138
           C 232 174, 218 210, 197 236
           C 181 258, 163 272, 152 280
           C 160 268, 175 252, 190 230
           C 212 204, 224 170, 220 138
           C 216 106, 198 86, 168 83 Z"
        fill="url(#ha-rv)"
        opacity="0.75"
      />

      {/* RIGHT ATRIUM — venous, right border */}
      <path
        d="M 214 120
           C 228 110, 244 98, 250 82
           C 254 68, 248 56, 238 56
           C 228 56, 220 68, 215 84
           C 210 99, 213 112, 214 120 Z"
        fill="url(#ha-ra)"
        opacity="0.9"
      />
      {/* RA inner highlight */}
      <path d="M 224 68 C 230 76, 234 90, 232 104"
        stroke="rgba(255,180,170,0.1)" strokeWidth="5" strokeLinecap="round"/>

      {/* Left auricular appendage */}
      <path
        d="M 88 114
           C 74 103, 65 88, 70 72
           C 75 58, 87 58, 93 68
           C 99 78, 94 96, 88 114 Z"
        fill="#7a1e1e" opacity="0.76"
      />

      {/* ════════════════════════════════════════
          SURFACE DETAIL
      ════════════════════════════════════════ */}

      {/* Anterior interventricular sulcus */}
      <path d="M 158 102 C 155 145, 151 194, 146 286"
        stroke="#220404" strokeWidth="3.5" strokeLinecap="round" opacity="0.55"/>

      {/* Atrioventricular groove */}
      <path d="M 90 124 C 103 116, 126 112, 148 110
               C 170 110, 196 116, 216 124"
        stroke="#1e0404" strokeWidth="2.5" strokeLinecap="round"
        opacity="0.40" fill="none"/>

      {/* Muscle fibre texture */}
      <path d="M 96 200 C 110 194, 124 193, 136 198" stroke="rgba(40,3,3,0.35)" strokeWidth="1" strokeLinecap="round"/>
      <path d="M 92 220 C 108 214, 124 213, 138 218" stroke="rgba(40,3,3,0.28)" strokeWidth="1" strokeLinecap="round"/>
      <path d="M 96 240 C 112 236, 126 235, 140 239" stroke="rgba(40,3,3,0.22)" strokeWidth="1" strokeLinecap="round"/>
      <path d="M 104 258 C 118 255, 130 255, 142 258" stroke="rgba(40,3,3,0.16)" strokeWidth="1" strokeLinecap="round"/>

      {/* ════════════════════════════════════════
          GREAT VESSELS — 3D CYLINDERS
      ════════════════════════════════════════ */}

      {/* ══ PULMONARY TRUNK — most anterior, venous blue, exits RV going upper-left
           Axis from (132,100)→(104,32). Width 17px.
           Perpendicular ≈ horizontal, so x-gradient = highlight left, shadow right.   */}
      {/* Cylinder body */}
      <path d="M 118,106 C 106,86 96,60 92,32
               L 110,26 C 114,54 124,80 136,100 Z"
        fill="url(#ha-pt-body)" />
      {/* Lit edge (left/upper side facing light) */}
      <path d="M 119,104 C 107,84 97,60 93,32"
        stroke="rgba(155,185,250,0.44)" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Shadow edge */}
      <path d="M 135,100 C 123,80 113,54 109,26"
        stroke="rgba(8,14,55,0.45)" strokeWidth="2" strokeLinecap="round"/>
      {/* Lumen opening (ellipse at top cut, slightly tilted) */}
      <ellipse cx="100" cy="29" rx="10" ry="4"
        fill="url(#ha-pt-lumen)" transform="rotate(-22,100,29)"/>
      <ellipse cx="100" cy="29" rx="10" ry="4"
        stroke="rgba(50,75,165,0.65)" strokeWidth="1"
        fill="none" transform="rotate(-22,100,29)"/>
      {/* Lumen inner rim shine */}
      <path d="M 93,26 C 97,28 104,29 110,27"
        stroke="rgba(100,140,220,0.28)" strokeWidth="1.2" strokeLinecap="round"/>

      {/* ── Bifurcation: LEFT Pulmonary Artery (continues upper-left) ── */}
      {/* Goes from ~(100,30) leftward */}
      <path d="M 96,26 C 82,22 66,20 52,23
               L 52,35 C 66,32 82,34 96,38 Z"
        fill="url(#ha-pt-body)" opacity="0.90"/>
      {/* LPA lit edge */}
      <path d="M 96,27 C 82,23 66,21 54,24"
        stroke="rgba(155,185,250,0.40)" strokeWidth="2" strokeLinecap="round"/>
      {/* LPA shadow edge */}
      <path d="M 96,37 C 82,34 66,33 54,35"
        stroke="rgba(8,14,55,0.38)" strokeWidth="1.5" strokeLinecap="round"/>
      {/* LPA cut end */}
      <ellipse cx="52" cy="29" rx="6" ry="4"
        fill="url(#ha-pt-lumen)" transform="rotate(5,52,29)"/>
      <ellipse cx="52" cy="29" rx="6" ry="4"
        stroke="rgba(50,75,165,0.58)" strokeWidth="0.8"
        fill="none" transform="rotate(5,52,29)"/>

      {/* ── Bifurcation: RIGHT Pulmonary Artery (goes right, behind aorta) ── */}
      <path d="M 106,28 C 120,24 136,23 148,26
               L 148,36 C 136,33 120,34 106,38 Z"
        fill="url(#ha-pt-body)" opacity="0.62"/>

      {/* ══ ASCENDING AORTA — arterial red, behind pulm trunk, curves to the right
           Axis from (158,100)→(176,34)→arches right. Width 17px.             */}
      {/* Cylinder body */}
      <path d="M 150,106 C 157,84 164,58 170,32
               L 186,38 C 180,64 173,90 166,112 Z"
        fill="url(#ha-ao-body)" />
      {/* Lit edge */}
      <path d="M 151,104 C 158,82 165,56 171,32"
        stroke="rgba(255,210,190,0.46)" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Shadow edge */}
      <path d="M 165,110 C 172,88 178,62 184,38"
        stroke="rgba(55,8,8,0.48)" strokeWidth="2" strokeLinecap="round"/>
      {/* Lumen at top of ascending portion */}
      <ellipse cx="178" cy="35" rx="9" ry="3.5"
        fill="url(#ha-ao-lumen)" transform="rotate(70,178,35)"/>
      <ellipse cx="178" cy="35" rx="9" ry="3.5"
        stroke="rgba(155,35,35,0.65)" strokeWidth="0.9"
        fill="none" transform="rotate(70,178,35)"/>
      {/* Lumen inner rim */}
      <path d="M 175,30 C 178,33 182,35 186,34"
        stroke="rgba(255,130,110,0.28)" strokeWidth="1.2" strokeLinecap="round"/>

      {/* Aortic arch — arches over the pulm trunk, going right */}
      <path d="M 170,32 C 177,20 190,14 205,16
               C 218,18 228,28 230,40
               L 230,52 C 226,40 216,30 204,28
               C 190,26 178,32 172,42 Z"
        fill="url(#ha-ao-body)" opacity="0.90"/>
      {/* Arch lit edge (outer curve) */}
      <path d="M 172,32 C 179,20 193,13 207,15 C 220,17 230,28 232,40"
        stroke="rgba(255,205,185,0.42)" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      {/* Arch shadow edge (inner curve) */}
      <path d="M 172,42 C 179,34 192,28 205,30 C 216,32 225,40 228,50"
        stroke="rgba(55,8,8,0.38)" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
      {/* Arch cut end (right side) */}
      <ellipse cx="230" cy="46" rx="6" ry="4"
        fill="url(#ha-ao-lumen)" transform="rotate(80,230,46)"/>
      <ellipse cx="230" cy="46" rx="6" ry="4"
        stroke="rgba(155,35,35,0.58)" strokeWidth="0.8"
        fill="none" transform="rotate(80,230,46)"/>

      {/* ══ SUPERIOR VENA CAVA — deep venous blue, nearly vertical, right side
           From top (x≈205-222, y≈18) down to right atrium (y≈100).           */}
      {/* Cylinder body (slight S-curve for realism) */}
      <path d="M 205,102 C 203,72 202,44 205,22
               C 207,14 220,14 222,22
               C 225,44 224,72 222,102 Z"
        fill="url(#ha-svc-body)" />
      {/* Lit edge (left side) */}
      <path d="M 207,98 C 206,70 205,44 207,22"
        stroke="rgba(140,175,235,0.44)" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Shadow edge (right side) */}
      <path d="M 221,98 C 222,70 222,44 221,22"
        stroke="rgba(6,10,40,0.44)" strokeWidth="1.8" strokeLinecap="round"/>
      {/* Lumen at top cut */}
      <ellipse cx="213" cy="20" rx="9" ry="3.5"
        fill="url(#ha-svc-lumen)" />
      <ellipse cx="213" cy="20" rx="9" ry="3.5"
        stroke="rgba(40,65,145,0.65)" strokeWidth="0.9" fill="none"/>
      {/* Lumen inner rim highlight */}
      <path d="M 206,20 C 209,22 214,22 218,20"
        stroke="rgba(110,155,230,0.28)" strokeWidth="1.2" strokeLinecap="round"/>

      {/* ════════════════════════════════════════
          CORONARY ARTERIES
      ════════════════════════════════════════ */}

      {/* Right Coronary Artery (RCA) */}
      <path d="M 212 124 C 225 146, 232 176, 228 204
               C 224 230, 210 252, 194 268"
        stroke="#e74c3c" strokeWidth="2.3" strokeLinecap="round"
        fill="none" opacity="0.70" filter="url(#ha-coro-glow)"/>
      <path d="M 230 168 C 238 175, 242 186, 237 197"
        stroke="#e74c3c" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.48"/>
      <path d="M 227 196 C 235 204, 236 216, 231 226"
        stroke="#e74c3c" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.40"/>
      <path d="M 220 222 C 227 230, 228 242, 222 250"
        stroke="#e74c3c" strokeWidth="0.9" strokeLinecap="round" fill="none" opacity="0.32"/>

      {/* Left Anterior Descending (LAD) */}
      <path d="M 154 104 C 152 148, 148 198, 144 282"
        stroke="#c0392b" strokeWidth="2.1" strokeLinecap="round"
        fill="none" opacity="0.68" filter="url(#ha-coro-glow)"/>
      {/* 1st diagonal */}
      <path d="M 153 130 C 144 142, 131 146, 115 146"
        stroke="#c0392b" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.52"/>
      {/* 2nd diagonal */}
      <path d="M 150 162 C 140 173, 126 177, 110 174"
        stroke="#c0392b" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.44"/>
      {/* 3rd diagonal */}
      <path d="M 148 196 C 137 206, 123 208, 107 204"
        stroke="#c0392b" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.36"/>
      {/* Septal perforators */}
      <path d="M 155 152 C 161 160, 164 170, 161 179"
        stroke="#a93226" strokeWidth="0.9" strokeLinecap="round" fill="none" opacity="0.30"/>
      <path d="M 152 182 C 158 190, 161 200, 157 209"
        stroke="#a93226" strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.25"/>

      {/* Left Circumflex (LCX) */}
      <path d="M 146 90 C 120 84, 96 100, 82 128
               C 72 148, 72 170, 80 190"
        stroke="#e74c3c" strokeWidth="1.8" strokeLinecap="round"
        fill="none" opacity="0.56" filter="url(#ha-coro-glow)"/>
      <path d="M 82 158 C 73 167, 71 180, 77 192"
        stroke="#e74c3c" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.38"/>
      <path d="M 80 188 C 70 198, 69 212, 76 222"
        stroke="#e74c3c" strokeWidth="0.9" strokeLinecap="round" fill="none" opacity="0.30"/>

      {/* ════════════════════════════════════════
          HIGHLIGHTS & SPECULAR
      ════════════════════════════════════════ */}

      {/* Broad diffuse highlight — left ventricular free wall */}
      <path d="M 132 96 C 103 108, 83 130, 77 160 C 73 182, 80 206, 92 224"
        stroke="rgba(255,255,255,0.09)" strokeWidth="28" strokeLinecap="round" fill="none"/>
      <path d="M 124 100 C 99 114, 82 138, 78 166"
        stroke="rgba(255,225,215,0.11)" strokeWidth="11" strokeLinecap="round" fill="none"/>

      {/* Specular spot — upper-left free wall */}
      <ellipse cx="108" cy="118" rx="21" ry="13"
        fill="rgba(255,255,255,0.11)" transform="rotate(-40,108,118)"/>
      {/* Smaller specular — right ventricle */}
      <ellipse cx="192" cy="106" rx="12" ry="7"
        fill="rgba(255,255,255,0.06)" transform="rotate(22,192,106)"/>

      {/* Overall sheen */}
      <path
        d="M 148 77 C 112 68, 74 90, 68 134 C 62 178, 80 218, 104 248
           C 122 270, 138 286, 148 294 C 158 286, 174 270, 192 248
           C 216 218, 234 178, 228 134 C 222 90, 184 68, 148 77 Z"
        fill="url(#ha-spec)" />

      {/* Apex shadow */}
      <ellipse cx="148" cy="292" rx="28" ry="7" fill="#180101" opacity="0.56"/>
    </svg>
  )
}
