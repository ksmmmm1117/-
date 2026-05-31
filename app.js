/* ==========================================================================
   Minimalist Study System - Core Application Logic
   Handles routing, simulation algorithms, time prediction, Pomodoro, 
   localStorage logs, and dynamic SVG graph rendering.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // ==========================================
  // 1. Data Store & State Management
  // ==========================================
  const DEFAULT_STATS = {
    weeklyHours: 32,
    weeklyMinutes: 15,
    completedAssignments: 14,
    assignmentGoal: 20,
    weeklyData: {
      studyHours: [0, 3, 8, 1, 4.5, 0.5, 2.5], // Mon to Sun
      completedTasks: [0, 1, 3, 1, 2, 0, 1]
    },
    monthlyData: {
      studyHours: [12, 24, 32, 28], // Week 1 to Week 4
      completedTasks: [5, 9, 14, 11]
    }
  };

  // Load from LocalStorage or seed defaults
  let appState = JSON.parse(localStorage.getItem('minimalist_study_state'));
  if (!appState) {
    appState = { ...DEFAULT_STATS };
    localStorage.setItem('minimalist_study_state', JSON.stringify(appState));
  }

  // Active inputs state
  let currentSimInputs = {
    subject: '',
    style: 'cramming',
    type: 'problems'
  };

  let currentPredInputs = {
    material: '',
    subject: '',
    chapter: '',
    startPage: 1,
    endPage: 150,
    questionCount: 40,
    intensity: 'deep',
    grade: 3,          // 1~6 (1 = top)
    difficulty: 'normal' // very-easy / easy / normal / hard / very-hard
  };

  // Last prediction result in minutes (for calibration)
  let lastPredictedMinutes = 0;

  // Timer run variables
  let timerInterval = null;
  let timerTotalSeconds = 0;
  let timerRemainingSeconds = 0;
  let isTimerPaused = false;

  // Web Audio Context for native synthesizer chime
  let audioCtx = null;

  // Subject lists
  const SUBJECTS = [
    '심리학 개론', '미적분학 및 연습', '알고리즘 개론', '인공지능 개론', 
    '유기화학', '컴퓨터 구조', '미시경제학', '서양미술사', '글쓰기 기초',
    '자료구조', '운영체제', '이산수학', '확률 및 통계', '일반물리학'
  ];

  // ==========================================
  // Known workbook difficulty map (한국 주요 문제집)
  // difficulty levels: very-easy / easy / normal / hard / very-hard
  // ==========================================
  const KNOWN_BOOKS = [
    // 수학
    { keywords: ['쎈', '개념원리', '수학의 기초'], difficulty: 'normal' },
    { keywords: ['블랙라벨', '킬러', 'top1000', 'top 1000'], difficulty: 'very-hard' },
    { keywords: ['자이스토리', 'ㅈㅅㅌ'], difficulty: 'hard' },
    { keywords: ['풍산자', '개념플러스유형', '개념+유형'], difficulty: 'easy' },
    { keywords: ['기본수학', '수학기본', '쉬운수학'], difficulty: 'very-easy' },
    { keywords: ['수학의 정석', '정석'], difficulty: 'hard' },
    { keywords: ['수능특강', '수능완성'], difficulty: 'normal' },
    { keywords: ['뉴런', '수분감'], difficulty: 'easy' },
    { keywords: ['rpe', 'rpy'], difficulty: 'very-hard' },
    // 영어
    { keywords: ['천일문', '어법끝', '수능영어'], difficulty: 'normal' },
    { keywords: ['독해기술', 'ebsi 영어', 'ebs 영어'], difficulty: 'normal' },
    { keywords: ['wordup', '워드업'], difficulty: 'easy' },
    { keywords: ['능률보카', 'voca', '단어장'], difficulty: 'easy' },
    // 과학
    { keywords: ['개념비법', '개념의 실력', '화학의 신'], difficulty: 'hard' },
    { keywords: ['물리의 신', '물리바이블'], difficulty: 'very-hard' },
    { keywords: ['하이탑', 'hi-top'], difficulty: 'hard' },
    { keywords: ['개념완성', '개념 완성'], difficulty: 'normal' },
    // 국어
    { keywords: ['화작문', '문학개념', '비문학'], difficulty: 'normal' },
    { keywords: ['수능국어', '리트'], difficulty: 'hard' },
    // 사회
    { keywords: ['생윤', '사문', '윤사', '한국지리'], difficulty: 'normal' },
    { keywords: ['세계사', '동아시아사'], difficulty: 'normal' },
  ];

  /**
   * 문제집 이름 기반 난이도 자동 추정
   * @param {string} bookName
   * @returns {string|null} difficulty value or null if unknown
   */
  function detectBookDifficulty(bookName) {
    if (!bookName) return null;
    const lower = bookName.toLowerCase();
    for (const book of KNOWN_BOOKS) {
      for (const kw of book.keywords) {
        if (lower.includes(kw.toLowerCase())) {
          return book.difficulty;
        }
      }
    }
    return null;
  }

  // ==========================================
  // Calibration factor (보정값) from localStorage
  // calibrationFactor: ratio (e.g. 1.2 = user takes 20% longer than predicted)
  // ==========================================
  function getCalibrationFactor() {
    const raw = localStorage.getItem('study_calibration_factor');
    return raw ? parseFloat(raw) : 1.0;
  }

  function saveCalibrationFactor(factor) {
    localStorage.setItem('study_calibration_factor', String(factor));
  }

  // Formatted time helper: minutes -> "Xh Ym"
  function formatMinutes(totalMins) {
    totalMins = Math.max(0, Math.round(totalMins));
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h 00m`;
    return `${h}h ${m}m`;
  }


  // ==========================================
  // Helper: Global Loading Overlay Animation
  // ==========================================
  function runLoadingCycle(phrases, callback) {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    
    // Select both submit buttons to disable them during calculation
    const simSubmitBtn = document.getElementById('simulation-submit-btn');
    const predSubmitBtn = document.getElementById('prediction-submit-btn');
    
    if (simSubmitBtn) simSubmitBtn.disabled = true;
    if (predSubmitBtn) predSubmitBtn.disabled = true;
    
    // Show overlay with active class
    loadingOverlay.classList.add('active');
    
    let index = 0;
    loadingText.textContent = phrases[0];
    
    // Transition text every 500ms
    const interval = setInterval(() => {
      index++;
      if (index < phrases.length) {
        loadingText.textContent = phrases[index];
      }
    }, 500);
    
    // Complete cycle after phrases.length * 500ms (e.g. 2s for 4 phrases)
    setTimeout(() => {
      clearInterval(interval);
      
      // Perform calculation & transition
      callback();
      
      // Hide overlay
      loadingOverlay.classList.remove('active');
      
      // Re-enable buttons
      if (simSubmitBtn) simSubmitBtn.disabled = false;
      if (predSubmitBtn) predSubmitBtn.disabled = false;
    }, phrases.length * 500);
  }

  // ==========================================
  // Helper: Press & Hold (길게 누르기) Accelerator
  // ==========================================
  function setupPressAndHold(element, callback) {
    let timeoutId = null;
    let intervalId = null;
    let isHolding = false;
    let startTime = 0;

    function startPress(e) {
      // Prevent default on touch to avoid double triggers/scrolling
      if (e.type === 'touchstart') {
        e.preventDefault();
      }
      
      // Perform immediate single trigger first
      callback();
      isHolding = true;
      startTime = Date.now();

      // Clear existing timers
      cleanup();

      // Phase 1: Wait 500ms before starting auto-repeat
      timeoutId = setTimeout(() => {
        if (!isHolding) return;
        runRepeatedly();
      }, 500);
    }

    function runRepeatedly() {
      if (!isHolding) return;
      
      const elapsed = Date.now() - startTime;
      let delay = 150; // Moderate speed (500ms - 1.5s)
      
      if (elapsed > 3000) {
        delay = 40; // Very fast speed (>3s)
      } else if (elapsed > 1500) {
        delay = 80; // Faster speed (1.5s - 3s)
      }
      
      callback();

      // Schedule next repeat dynamically to adjust speed
      intervalId = setTimeout(runRepeatedly, delay);
    }

    function cleanup() {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearTimeout(intervalId);
      timeoutId = null;
      intervalId = null;
    }

    function endPress() {
      isHolding = false;
      cleanup();
    }

    // Mouse Listeners
    element.addEventListener('mousedown', startPress);
    element.addEventListener('mouseup', endPress);
    element.addEventListener('mouseleave', endPress);

    // Touch Listeners (Mobile compatibility)
    element.addEventListener('touchstart', startPress, { passive: false });
    element.addEventListener('touchend', endPress);
    element.addEventListener('touchcancel', endPress);
  }

  // ==========================================
  // 2. Navigation / Router & Sidebar Menu
  // ==========================================
  const navTabs = document.querySelectorAll('.nav-tab');
  const viewPanels = document.querySelectorAll('.view-panel');
  const headerTitle = document.getElementById('header-title-text');
  const appScrollContainer = document.getElementById('app-content-scroll');

  // Sidebar elements
  const menuToggleBtn = document.getElementById('menu-toggle-btn');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const sidebarDrawer = document.getElementById('sidebar-drawer');
  const sidebarButtons = document.querySelectorAll('.sidebar-item-btn');

  // Mapping views to friendly header titles
  const VIEW_TITLES = {
    'home': '홈',
    'simulation-form': '과제 생존 마감 시뮬레이터',
    'simulation-result': '과제 생존 마감 시뮬레이터',
    'prediction-form': '공부 시간 예측',
    'prediction-result': '공부 시간 예측',
    'statistics': '통계'
  };

  function switchView(viewId) {
    // Hide all panels, show matching panel
    viewPanels.forEach(panel => {
      panel.classList.remove('active');
      if (panel.id === `view-${viewId}`) {
        panel.classList.add('active');
      }
    });

    // Update bottom nav active state if it matches a primary tab
    navTabs.forEach(tab => {
      tab.classList.remove('active');
      const target = tab.getAttribute('data-target');
      
      // If we are on form or result subpages, keep main tab active
      if (target === 'simulation' && (viewId === 'simulation-form' || viewId === 'simulation-result')) {
        tab.classList.add('active');
      } else if (target === 'prediction' && (viewId === 'prediction-form' || viewId === 'prediction-result')) {
        tab.classList.add('active');
      } else if (target === viewId) {
        tab.classList.add('active');
      }
    });

    // Update sidebar buttons active state
    sidebarButtons.forEach(btn => {
      btn.classList.remove('active');
      const target = btn.getAttribute('data-target');
      if (target === 'simulation' && (viewId === 'simulation-form' || viewId === 'simulation-result')) {
        btn.classList.add('active');
      } else if (target === 'prediction' && (viewId === 'prediction-form' || viewId === 'prediction-result')) {
        btn.classList.add('active');
      } else if (target === viewId) {
        btn.classList.add('active');
      }
    });

    // Update header title text
    headerTitle.textContent = VIEW_TITLES[viewId] || 'Minimalist Study';

    // Reset scroll to top
    appScrollContainer.scrollTop = 0;

    // Special view triggers
    if (viewId === 'statistics') {
      renderSVGChart('weekly');
    }
  }

  // Bind Bottom Nav clicks
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-target');
      if (target === 'simulation') {
        switchView('simulation-form');
      } else if (target === 'prediction') {
        switchView('prediction-form');
      } else {
        switchView(target);
      }
    });
  });

  // Bind Sidebar items clicks
  sidebarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      sidebarOverlay.classList.remove('active');
      if (target === 'simulation') {
        switchView('simulation-form');
      } else if (target === 'prediction') {
        switchView('prediction-form');
      } else {
        switchView(target);
      }
    });
  });

  // Hamburger menu toggle
  menuToggleBtn.addEventListener('click', () => {
    sidebarOverlay.classList.toggle('active');
  });

  // Tap overlay to close sidebar
  sidebarOverlay.addEventListener('click', (e) => {
    if (e.target === sidebarOverlay) {
      sidebarOverlay.classList.remove('active');
    }
  });

  // Home Dashboard quick buttons navigation bindings
  document.getElementById('home-goto-sim-btn').addEventListener('click', () => switchView('simulation-form'));
  document.getElementById('home-goto-pred-btn').addEventListener('click', () => switchView('prediction-form'));
  document.getElementById('home-goto-timer-btn').addEventListener('click', () => switchView('prediction-result'));
  document.getElementById('home-goto-stats-btn').addEventListener('click', () => switchView('statistics'));

  // ==========================================
  // 3. Global Toast Warning Notifications
  // ==========================================
  const toastAlert = document.getElementById('toast-alert');
  const toastMessage = document.getElementById('toast-message');
  let toastTimeout = null;

  function showToast(msg) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastMessage.textContent = msg;
    toastAlert.classList.add('active');
    toastTimeout = setTimeout(() => {
      toastAlert.classList.remove('active');
    }, 3000);
  }

  // ==========================================
  // 4. View 1: Subject Search Suggestions
  // ==========================================
  const subjectInput = document.getElementById('subject-search-input');
  const suggestionBox = document.getElementById('subject-suggestion-box');

  subjectInput.addEventListener('input', () => {
    const val = subjectInput.value.trim().toLowerCase();
    suggestionBox.innerHTML = '';
    
    if (!val) {
      suggestionBox.classList.remove('active');
      return;
    }

    const matches = SUBJECTS.filter(s => s.toLowerCase().includes(val));
    if (matches.length === 0) {
      suggestionBox.classList.remove('active');
      return;
    }

    matches.forEach(match => {
      const li = document.createElement('li');
      li.className = 'suggestion-item';
      li.textContent = match;
      li.addEventListener('click', () => {
        subjectInput.value = match;
        currentSimInputs.subject = match;
        suggestionBox.classList.remove('active');
      });
      suggestionBox.appendChild(li);
    });
    
    suggestionBox.classList.add('active');
  });

  // Close suggestions when tapping outside
  document.addEventListener('click', (e) => {
    if (e.target !== subjectInput && e.target !== suggestionBox) {
      suggestionBox.classList.remove('active');
    }
  });

  // ==========================================
  // 5. Card Toggle Selected State Handler
  // ==========================================
  
  // Study style selection
  const studyStyleCards = document.querySelectorAll('#study-style-container .study-method-card');
  studyStyleCards.forEach(card => {
    card.addEventListener('click', () => {
      studyStyleCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      currentSimInputs.style = card.getAttribute('data-value');
    });
  });

  // Assignment type selection
  const assignmentCards = document.querySelectorAll('#assignment-type-grid .assignment-card');
  assignmentCards.forEach(card => {
    card.addEventListener('click', () => {
      assignmentCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      currentSimInputs.type = card.getAttribute('data-value');
    });
  });

  // Study Mode selection (Screen 3)
  const modeCards = document.querySelectorAll('#study-mode-list .mode-card');
  modeCards.forEach(card => {
    card.addEventListener('click', () => {
      modeCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      currentPredInputs.intensity = card.getAttribute('data-value');
    });
  });

  // ==========================================
  // 6. View 1 -> 4: Deadline Simulation Logic
  // ==========================================
  const simSubmitBtn = document.getElementById('simulation-submit-btn');
  const simResetBtn = document.getElementById('sim-reset-btn');

  const simResultHours = document.getElementById('sim-result-hours');
  const simResultProgressFill = document.getElementById('sim-result-progress-fill');
  const simResultProgressVal = document.getElementById('sim-result-progress-val');
  const simStatusTitle = document.getElementById('sim-status-title');
  const simStatusDesc = document.getElementById('sim-status-desc');

  simSubmitBtn.addEventListener('click', () => {
    const inputSubj = subjectInput.value.trim();
    if (!inputSubj) {
      showToast('과목을 입력 또는 선택해주세요.');
      return;
    }
    currentSimInputs.subject = inputSubj;

    const SIM_PHRASES = [
      "과제 생존 확률 계산 중...",
      "집중력 분석 중...",
      "마감 위험도 확인 중...",
      "결과 생성 중..."
    ];

    runLoadingCycle(SIM_PHRASES, () => {
      // Simulation Math Calculation
      let baseMinutes = 150; // default 2h 30m
      let progressPercent = 85;
      let titleMsg = '';
      let descMsg = '';

      // Check specific default combination to hit screen 4 exact specs
      if (currentSimInputs.style === 'cramming' && currentSimInputs.type === 'problems') {
        baseMinutes = 150; // exactly 2h 30m
        progressPercent = 85; // exactly 85%
        titleMsg = '이대로라면 마감 2시간 전 완료 가능!';
        descMsg = '현재 페이스를 유지한다면 여유롭게 과제를 제출할 수 있습니다. 하지만 변수는 언제나 존재하니 지금 바로 시작하세요.';
      } else {
        // Dynamic computation
        // Base hours by assignment
        if (currentSimInputs.type === 'report') {
          baseMinutes = 180; // 3h
        } else if (currentSimInputs.type === 'problems') {
          baseMinutes = 150; // 2h 30m
        } else if (currentSimInputs.type === 'presentation') {
          baseMinutes = 105; // 1h 45m
        } else if (currentSimInputs.type === 'project') {
          baseMinutes = 255; // 4h 15m
        }

        // Modifier by style
        if (currentSimInputs.style === 'cramming') {
          baseMinutes = Math.max(60, baseMinutes - 20);
          progressPercent = 70;
          titleMsg = '마감 직전 완료 예상, 아슬아슬합니다!';
          descMsg = '벼락치기 공부법은 속도는 빠르나 실수가 많아질 수 있습니다. 마감 시간에 늦지 않도록 서둘러 시작하세요!';
        } else if (currentSimInputs.style === 'steady') {
          baseMinutes = baseMinutes; // standard
          progressPercent = 90;
          titleMsg = '여유롭게 완성! 안정적인 생존율입니다.';
          descMsg = '꾸준한 페이스를 이어가신다면 완벽한 제출이 가능합니다. 이 기조를 이어서 지금 집중해 보세요.';
        } else if (currentSimInputs.style === 'deep') {
          baseMinutes = baseMinutes + 75; // deep research overhead
          progressPercent = 95;
          titleMsg = '완벽한 완성 가능! 뛰어난 퀄리티 예상.';
          descMsg = '심도 깊은 학습 스타일로 확실히 과제를 해결할 수 있습니다. 예상 시간은 늘었지만 완성도는 극대화됩니다.';
        }

        // Hash code subject modifier
        let hash = 0;
        for (let i = 0; i < currentSimInputs.subject.length; i++) {
          hash = currentSimInputs.subject.charCodeAt(i) + ((hash << 5) - hash);
        }
        const modMin = (Math.abs(hash) % 3) * 15 - 15; // -15, 0, or 15 mins
        baseMinutes += modMin;
      }

      // Format output hours/minutes
      const hrs = Math.floor(baseMinutes / 60);
      const mins = baseMinutes % 60;
      const timeStr = `${hrs}h ${mins > 0 ? mins + 'm' : '00m'}`;

      // Set UI outputs
      simResultHours.textContent = timeStr;
      simResultProgressVal.textContent = `${progressPercent}%`;
      simStatusTitle.textContent = titleMsg;
      simStatusDesc.textContent = descMsg;

      // Reset and trigger animated progress bar
      simResultProgressFill.style.width = '0%';
      
      switchView('simulation-result');

      // Trigger bar fill animation
      setTimeout(() => {
        simResultProgressFill.style.width = `${progressPercent}%`;
      }, 100);
    });
  });

  simResetBtn.addEventListener('click', () => {
    subjectInput.value = '';
    currentSimInputs.subject = '';
    switchView('simulation-form');
  });

  // ==========================================
  // 7. View 3 -> 2: AI-Based Study Time Predictor
  // ==========================================
  const predSubmitBtn = document.getElementById('prediction-submit-btn');

  const predResultHours = document.getElementById('pred-result-hours');
  const predResultMin = document.getElementById('pred-result-min');
  const predResultMax = document.getElementById('pred-result-max');
  const predResultProgressFill = document.getElementById('pred-result-progress-fill');
  const predResultConfidence = document.getElementById('pred-result-confidence');
  const predResultComplexity = document.getElementById('pred-result-complexity');
  const calibrationIndicator = document.getElementById('calibration-indicator');

  // Input elements
  const materialNameInput = document.getElementById('material-name-input');
  const materialStartPage = document.getElementById('material-start-page');
  const materialEndPage = document.getElementById('material-end-page');
  const predQuestionsInput = document.getElementById('pred-questions-input');
  const predSubjectInput = document.getElementById('pred-subject-input');
  const predChapterInput = document.getElementById('pred-chapter-input');

  // ── Difficulty auto-detect when user types book name ──
  materialNameInput.addEventListener('input', () => {
    const name = materialNameInput.value.trim();
    const detected = detectBookDifficulty(name);
    const diffSelector = document.getElementById('pred-difficulty-selector');
    const chips = diffSelector.querySelectorAll('.difficulty-chip');
    const label = diffSelector.previousElementSibling; // the <label> above

    // Remove old auto-badge
    const oldBadge = label.querySelector('.difficulty-auto-badge');
    if (oldBadge) oldBadge.remove();

    if (detected) {
      // Update chip selection
      chips.forEach(c => {
        c.classList.remove('selected');
        if (c.getAttribute('data-value') === detected) c.classList.add('selected');
      });
      currentPredInputs.difficulty = detected;

      // Show auto-detected badge
      const badge = document.createElement('span');
      badge.className = 'difficulty-auto-badge';
      badge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width:10px;height:10px"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg> 자동 감지됨`;
      label.appendChild(badge);
    }
  });

  // ── Grade chip selection ──
  const gradeChips = document.querySelectorAll('#pred-grade-selector .grade-chip');
  gradeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      gradeChips.forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      currentPredInputs.grade = parseInt(chip.getAttribute('data-value'));
    });
  });

  // ── Difficulty chip selection ──
  const diffChips = document.querySelectorAll('#pred-difficulty-selector .difficulty-chip');
  diffChips.forEach(chip => {
    chip.addEventListener('click', () => {
      diffChips.forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      currentPredInputs.difficulty = chip.getAttribute('data-value');
      // Remove auto-badge if user manually overrides
      const label = document.getElementById('pred-difficulty-selector').previousElementSibling;
      const badge = label.querySelector('.difficulty-auto-badge');
      if (badge) badge.remove();
    });
  });

  /**
   * Core AI prediction engine.
   * Returns { minutes, minMinutes, maxMinutes, confidence, complexity }
   */
  function computePrediction(inputs) {
    const { startPage, endPage, questionCount, intensity, grade, difficulty } = inputs;
    const totalPages = Math.max(1, endPage - startPage + 1);
    const questions = Math.max(0, questionCount || 0);

    // ── Base minutes per page by intensity ──
    // deep: 1.0 min/page, balanced: 0.67, skimming: 0.40
    const PAGE_RATE = { deep: 1.0, balanced: 0.67, skimming: 0.40 };
    const pageRate = PAGE_RATE[intensity] || 0.67;

    // ── Base minutes per question by intensity ──
    // deep: 4 min/q, balanced: 2.5, skimming: 1.2
    const Q_RATE = { deep: 4.0, balanced: 2.5, skimming: 1.2 };
    const qRate = Q_RATE[intensity] || 2.5;

    // Combined base (weight pages 60%, questions 40% if both present)
    let baseMinutes;
    if (questions > 0) {
      baseMinutes = (totalPages * pageRate * 0.6) + (questions * qRate * 0.4);
    } else {
      baseMinutes = totalPages * pageRate;
    }

    // ── Difficulty multiplier ──
    const DIFF_MULT = {
      'very-easy': 0.65,
      'easy':      0.80,
      'normal':    1.00,
      'hard':      1.30,
      'very-hard': 1.65
    };
    const diffMult = DIFF_MULT[difficulty] || 1.0;
    baseMinutes *= diffMult;

    // ── Grade modifier (학업 수준 보정) ──
    // Grade 1 = fastest (0.7x), Grade 6 = slowest (1.5x)
    // Linear interpolation: grade 1->0.70, 2->0.82, 3->0.95, 4->1.10, 5->1.28, 6->1.50
    const GRADE_MULT = [null, 0.70, 0.82, 0.95, 1.10, 1.28, 1.50];
    const gradeMult = GRADE_MULT[grade] || 1.0;
    baseMinutes *= gradeMult;

    // ── Intensity base confidence & complexity label ──
    let confidence, complexity;
    if (intensity === 'deep') {
      confidence = 85; complexity = '높음';
    } else if (intensity === 'balanced') {
      confidence = 90; complexity = '보통';
    } else {
      confidence = 75; complexity = '낮음';
    }

    // Confidence boost for known difficulty (was auto-detected or explicitly set)
    if (difficulty !== 'normal') confidence = Math.min(95, confidence + 3);
    // Confidence boost for more data (question count provided)
    if (questions > 0) confidence = Math.min(97, confidence + 2);

    // ── Variance band (±%) for min/max ──
    const VARIANCE = {
      'very-easy': 0.10, 'easy': 0.12,
      'normal': 0.15,
      'hard': 0.20, 'very-hard': 0.25
    };
    const variance = VARIANCE[difficulty] || 0.15;
    const minMinutes = baseMinutes * (1 - variance);
    const maxMinutes = baseMinutes * (1 + variance);

    // ── Apply calibration factor ──
    const cal = getCalibrationFactor();
    const calibrated = baseMinutes * cal;
    const calMin = minMinutes * cal;
    const calMax = maxMinutes * cal;

    return {
      minutes: Math.round(calibrated),
      minMinutes: Math.round(calMin),
      maxMinutes: Math.round(calMax),
      confidence,
      complexity
    };
  }

  predSubmitBtn.addEventListener('click', () => {
    const materialName = materialNameInput.value.trim();
    const startP = parseInt(materialStartPage.value);
    const endP = parseInt(materialEndPage.value);
    const qCount = parseInt(predQuestionsInput.value) || 0;

    // Form validation
    if (!materialName) {
      showToast('교재 또는 자료명을 입력해주세요.');
      return;
    }
    if (isNaN(startP) || isNaN(endP) || startP < 1 || endP < 1 || startP > endP) {
      showToast('올바른 페이지 범위를 입력해주세요.');
      return;
    }

    // Save inputs to state
    currentPredInputs.material = materialName;
    currentPredInputs.subject = predSubjectInput ? predSubjectInput.value.trim() : '';
    currentPredInputs.chapter = predChapterInput ? predChapterInput.value.trim() : '';
    currentPredInputs.startPage = startP;
    currentPredInputs.endPage = endP;
    currentPredInputs.questionCount = qCount;

    const PRED_PHRASES = [
      "학습 교재 분량 분석 중...",
      "집중 난이도 평가 중...",
      "AI 예상 소요 시간 산출 중...",
      "예측 결과 생성 중..."
    ];

    runLoadingCycle(PRED_PHRASES, () => {
      const result = computePrediction(currentPredInputs);
      lastPredictedMinutes = result.minutes;

      const hrs = Math.floor(result.minutes / 60);
      const mins = result.minutes % 60;
      const timeStr = formatMinutes(result.minutes);

      // Show calibration indicator if factor != 1.0
      const cal = getCalibrationFactor();
      if (calibrationIndicator) {
        calibrationIndicator.style.display = Math.abs(cal - 1.0) > 0.01 ? 'inline-flex' : 'none';
      }

      // Fill prediction outputs
      predResultHours.textContent = timeStr;
      if (predResultMin) predResultMin.textContent = formatMinutes(result.minMinutes);
      if (predResultMax) predResultMax.textContent = formatMinutes(result.maxMinutes);
      predResultConfidence.textContent = `${result.confidence}%`;
      predResultComplexity.textContent = result.complexity;

      // Reset actual time inputs
      const actualH = document.getElementById('actual-hours-input');
      const actualM = document.getElementById('actual-minutes-input');
      if (actualH) actualH.value = hrs;
      if (actualM) actualM.value = mins;

      // Hide previous save message
      const savedMsg = document.getElementById('calibration-saved-msg');
      if (savedMsg) savedMsg.classList.remove('visible');

      // Set Pomodoro Timer pre-fill Pickers
      const hourBlock = document.getElementById('timer-picker-hour');
      const minBlock = document.getElementById('timer-picker-minute');
      hourBlock.textContent = String(hrs).padStart(2, '0');
      minBlock.textContent = String(mins).padStart(2, '0');

      // Trigger prediction layout progress fill animation
      predResultProgressFill.style.width = '0%';
      switchView('prediction-result');
      setTimeout(() => {
        predResultProgressFill.style.width = `${result.confidence}%`;
      }, 100);
    });
  });

  // ==========================================
  // Actual Time Calibration Handler
  // ==========================================
  const saveActualTimeBtn = document.getElementById('save-actual-time-btn');
  if (saveActualTimeBtn) {
    saveActualTimeBtn.addEventListener('click', () => {
      const actualH = parseInt(document.getElementById('actual-hours-input').value) || 0;
      const actualM = parseInt(document.getElementById('actual-minutes-input').value) || 0;
      const actualMinutes = actualH * 60 + actualM;

      if (actualMinutes <= 0) {
        showToast('실제 소요 시간을 입력해주세요.');
        return;
      }
      if (lastPredictedMinutes <= 0) {
        showToast('예측 결과가 없습니다. 먼저 예측을 실행해주세요.');
        return;
      }

      // Compute new ratio between actual and predicted
      const newRatio = actualMinutes / lastPredictedMinutes;

      // Smooth update: blend 70% old factor + 30% new observation (Exponential moving average)
      const oldFactor = getCalibrationFactor();
      const updatedFactor = oldFactor * 0.70 + newRatio * 0.30;

      // Clamp to reasonable range [0.5, 2.5]
      const clampedFactor = Math.min(2.5, Math.max(0.5, updatedFactor));
      saveCalibrationFactor(clampedFactor);

      // Show confirmation message
      const savedMsg = document.getElementById('calibration-saved-msg');
      if (savedMsg) {
        savedMsg.classList.add('visible');
        // Show calibration indicator badge
        if (calibrationIndicator) {
          calibrationIndicator.style.display = 'inline-flex';
        }
        // Auto-hide after 4s
        setTimeout(() => savedMsg.classList.remove('visible'), 4000);
      }

      showToast('보정값이 저장되었습니다!');
    });
  }

  // ==========================================
  // 8. View 2: Sleek Pomodoro Timer Controller
  // ==========================================
  const adjustHourUp = document.getElementById('adjust-hour-up');
  const adjustHourDown = document.getElementById('adjust-hour-down');
  const adjustMinUp = document.getElementById('adjust-minute-up');
  const adjustMinDown = document.getElementById('adjust-minute-down');

  const hourBlock = document.getElementById('timer-picker-hour');
  const minBlock = document.getElementById('timer-picker-minute');

  const timerStartBtn = document.getElementById('timer-start-btn');
  const timerPauseBtn = document.getElementById('timer-pause-btn');
  const timerStopBtn = document.getElementById('timer-stop-btn');

  const timerPickerPanel = document.getElementById('timer-picker-panel');
  const timerRunningPanel = document.getElementById('timer-running-panel');

  const timerRunningDigits = document.getElementById('timer-running-digits');
  const timerStatusBadge = document.getElementById('timer-status-badge');
  const timerRingFill = document.getElementById('timer-ring-fill');

  // Adjust hour buttons (1-hour step, press & hold accelerated)
  setupPressAndHold(adjustHourUp, () => {
    let h = parseInt(hourBlock.textContent);
    h = (h + 1) % 24;
    hourBlock.textContent = String(h).padStart(2, '0');
  });

  setupPressAndHold(adjustHourDown, () => {
    let h = parseInt(hourBlock.textContent);
    h = (h - 1 + 24) % 24;
    hourBlock.textContent = String(h).padStart(2, '0');
  });

  // Adjust minute buttons (1-minute step, press & hold accelerated)
  setupPressAndHold(adjustMinUp, () => {
    let m = parseInt(minBlock.textContent);
    m = (m + 1) % 60;
    minBlock.textContent = String(m).padStart(2, '0');
  });

  setupPressAndHold(adjustMinDown, () => {
    let m = parseInt(minBlock.textContent);
    m = (m - 1 + 60) % 60;
    minBlock.textContent = String(m).padStart(2, '0');
  });

  // Synthesizer chime audio alerts using native browser Web Audio API
  function initAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playAlertChime() {
    try {
      initAudioContext();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      
      const now = audioCtx.currentTime;
      // High-premium minimalist bell synthesizer sound (sine wave chime)
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now); // A5 note
      osc1.frequency.exponentialRampToValueAtTime(440, now + 1.2); // Smooth drop to A4

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1320, now); // E6 note
      osc2.frequency.exponentialRampToValueAtTime(660, now + 1.2);

      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.5); // Fast smooth decay

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.5);
      osc2.stop(now + 1.5);
    } catch (e) {
      console.warn("Audio Context chime failed to play: ", e);
    }
  }

  // Timer Start
  timerStartBtn.addEventListener('click', () => {
    initAudioContext();
    
    const h = parseInt(hourBlock.textContent);
    const m = parseInt(minBlock.textContent);
    
    timerTotalSeconds = (h * 3600) + (m * 60);
    
    if (timerTotalSeconds <= 0) {
      showToast('학습 시간을 1분 이상 설정해 주세요.');
      return;
    }

    timerRemainingSeconds = timerTotalSeconds;
    isTimerPaused = false;

    // Show Running Panel
    timerPickerPanel.style.display = 'none';
    timerRunningPanel.style.display = 'block';

    timerStatusBadge.textContent = '집중 연구중';
    timerStatusBadge.style.color = 'var(--text-secondary)';
    timerPauseBtn.textContent = '일시 정지';
    
    updateTimerUI();
    
    // Launch Interval timer
    timerInterval = setInterval(() => {
      if (!isTimerPaused) {
        timerRemainingSeconds--;
        updateTimerUI();

        if (timerRemainingSeconds <= 0) {
          handleTimerComplete();
        }
      }
    }, 1000);
  });

  // Timer pause / resume
  timerPauseBtn.addEventListener('click', () => {
    isTimerPaused = !isTimerPaused;
    if (isTimerPaused) {
      timerPauseBtn.textContent = '재개';
      timerStatusBadge.textContent = '학습 대기';
      timerStatusBadge.style.color = 'var(--text-caption)';
    } else {
      timerPauseBtn.textContent = '일시 정지';
      timerStatusBadge.textContent = '집중 연구중';
      timerStatusBadge.style.color = 'var(--text-secondary)';
    }
  });

  // Timer Stop / Terminate
  timerStopBtn.addEventListener('click', () => {
    resetActiveTimerState();
  });

  function updateTimerUI() {
    const h = Math.floor(timerRemainingSeconds / 3600);
    const m = Math.floor((timerRemainingSeconds % 3600) / 60);
    const s = timerRemainingSeconds % 60;

    // Format HH:MM:SS
    timerRunningDigits.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    // SVG Ring Fill dashoffset calculation (Base stroke-dasharray = 628)
    const ratio = timerRemainingSeconds / timerTotalSeconds;
    const offset = 628 - (628 * ratio);
    timerRingFill.style.strokeDashoffset = offset;
  }

  function resetActiveTimerState() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerRemainingSeconds = 0;
    timerTotalSeconds = 0;

    timerRunningPanel.style.display = 'none';
    timerPickerPanel.style.display = 'block';
  }

  // Timer Completed Event
  function handleTimerComplete() {
    playAlertChime();
    
    // Capture study details
    const hoursStudied = Math.floor(timerTotalSeconds / 3600);
    const minutesStudied = Math.floor((timerTotalSeconds % 3600) / 60);

    // Save statistics in AppState
    appState.weeklyHours += hoursStudied;
    appState.weeklyMinutes += minutesStudied;
    if (appState.weeklyMinutes >= 60) {
      appState.weeklyHours += Math.floor(appState.weeklyMinutes / 60);
      appState.weeklyMinutes = appState.weeklyMinutes % 60;
    }
    appState.completedAssignments += 1;

    // Push study hours to Wednesday (active Day 2 - index 2) or current day (Sunday/Sun = index 6)
    const currentDayIndex = new Date().getDay(); // 0 is Sun, 1 is Mon etc.
    const mappedDayIndex = currentDayIndex === 0 ? 6 : currentDayIndex - 1; // Mon=0, Sun=6
    appState.weeklyData.studyHours[mappedDayIndex] += (timerTotalSeconds / 3600);
    appState.weeklyData.completedTasks[mappedDayIndex] += 1;

    // Save persisted state
    localStorage.setItem('minimalist_study_state', JSON.stringify(appState));

    // Reset UI
    resetActiveTimerState();

    // Alert
    alert(`🎉 대단합니다! ${hoursStudied > 0 ? hoursStudied + '시간 ' : ''}${minutesStudied}분의 학습이 성공적으로 완료되어 통계 대시보드에 기록되었습니다.`);
  }

  // ==========================================
  // 9. View 5: Dynamic Statistics Dashboard SVG
  // ==========================================
  const toggleWeeklyBtn = document.getElementById('toggle-weekly-btn');
  const toggleMonthlyBtn = document.getElementById('toggle-monthly-btn');

  const statsTotalHours = document.getElementById('stats-total-hours');
  const statsTotalMinutes = document.getElementById('stats-total-minutes');
  const statsCompletedCount = document.getElementById('stats-completed-count');
  const statsCompletedProgressFill = document.getElementById('stats-completed-progress-fill');
  const statsCompletedPercentLabel = document.getElementById('stats-completed-percent-label');

  // Toggle chart duration button events
  toggleWeeklyBtn.addEventListener('click', () => {
    toggleWeeklyBtn.classList.add('active');
    toggleMonthlyBtn.classList.remove('active');
    renderSVGChart('weekly');
  });

  toggleMonthlyBtn.addEventListener('click', () => {
    toggleWeeklyBtn.classList.remove('active');
    toggleMonthlyBtn.classList.add('active');
    renderSVGChart('monthly');
  });

  function updateDashboardMetrics() {
    statsTotalHours.textContent = appState.weeklyHours;
    statsTotalMinutes.textContent = appState.weeklyMinutes;
    statsCompletedCount.textContent = appState.completedAssignments;

    const goalPercent = Math.min(100, Math.round((appState.completedAssignments / appState.assignmentGoal) * 100));
    statsCompletedProgressFill.style.width = `${goalPercent}%`;
    statsCompletedPercentLabel.textContent = `목표의 ${goalPercent}% 달성`;
  }

  // Interactive SVG Combined Bar-Line Chart Generator
  function renderSVGChart(mode = 'weekly') {
    updateDashboardMetrics();

    const chartSvg = document.getElementById('stats-svg-chart');
    const tooltip = document.getElementById('chart-tooltip');
    chartSvg.innerHTML = ''; // Clean old nodes

    const margin = { top: 30, right: 30, bottom: 40, left: 40 };
    const width = 400;
    const height = 200;
    const graphWidth = width - margin.left - margin.right;
    const graphHeight = height - margin.top - margin.bottom;

    // SVG Namespaces
    const svgNS = "http://www.w3.org/2000/svg";

    // 1. Draw helper grids and base lines
    const gridYValues = [0, 5, 10];
    gridYValues.forEach(val => {
      // Y position relative to graph coordinate space
      const yPos = margin.top + graphHeight - (val / 10) * graphHeight;

      // Draw dashed horizontal lines
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', margin.left);
      line.setAttribute('y1', yPos);
      line.setAttribute('x2', width - margin.right);
      line.setAttribute('y2', yPos);
      line.setAttribute('class', val === 0 ? 'chart-axis-line' : 'chart-grid-line');
      chartSvg.appendChild(line);

      // Y Text Labels
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', margin.left - 10);
      text.setAttribute('y', yPos + 4);
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('class', 'chart-axis-text');
      text.textContent = `${val}h`;
      chartSvg.appendChild(text);
    });

    // Data selector
    let hoursData = [];
    let completedData = [];
    let xLabels = [];

    if (mode === 'weekly') {
      hoursData = appState.weeklyData.studyHours;
      completedData = appState.weeklyData.completedTasks;
      xLabels = ['월', '화', '수', '목', '금', '토', '일'];
    } else {
      hoursData = appState.monthlyData.studyHours;
      completedData = appState.monthlyData.completedTasks;
      xLabels = ['1주', '2주', '3주', '4주'];
    }

    const nPoints = hoursData.length;
    const colWidth = graphWidth / nPoints;

    // Max limiters to prevent overflow math
    const maxYVal = 10;
    const maxTasksVal = 4; // Max task line scale is 4 tasks standard

    // Draw Bar Charts (Study hours)
    for (let i = 0; i < nPoints; i++) {
      const hVal = hoursData[i];
      const barHeight = Math.min(graphHeight, (hVal / maxYVal) * graphHeight);
      
      const xPos = margin.left + (i * colWidth) + (colWidth * 0.25);
      const yPos = margin.top + graphHeight - barHeight;
      const barWidth = colWidth * 0.5;

      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', xPos);
      rect.setAttribute('y', yPos);
      rect.setAttribute('width', barWidth);
      rect.setAttribute('height', Math.max(1, barHeight));
      rect.setAttribute('class', 'chart-bar');
      rect.setAttribute('rx', '2'); // border radius for soft minimalist details

      // Wednesday 수 check style matching bold label
      if (mode === 'weekly' && i === 2) {
        rect.style.fill = '#c6c6c6'; // darker gray accent for active day
      }

      // Add tooltip interactions
      rect.addEventListener('mousemove', (e) => {
        rect.style.fill = 'var(--primary)';
        tooltip.textContent = `${hVal.toFixed(1)}시간 학습`;
        tooltip.classList.add('active');
        
        // Compute relative positions
        const wrapperRect = chartSvg.getBoundingClientRect();
        const absoluteX = e.clientX - wrapperRect.left;
        const absoluteY = e.clientY - wrapperRect.top;
        
        tooltip.style.left = `${absoluteX}px`;
        tooltip.style.top = `${absoluteY - 8}px`;
      });

      rect.addEventListener('mouseleave', () => {
        rect.style.fill = (mode === 'weekly' && i === 2) ? '#c6c6c6' : '#e5e5e5';
        tooltip.classList.remove('active');
      });

      chartSvg.appendChild(rect);
    }

    // Draw Line Chart (Completed tasks)
    let pointsString = "";
    const lineCoords = [];

    for (let i = 0; i < nPoints; i++) {
      const tVal = completedData[i];
      const xPos = margin.left + (i * colWidth) + (colWidth / 2);
      // Let scale max tasks mapping to Y axis height (e.g. 4 tasks = top max)
      const yPos = margin.top + graphHeight - (tVal / maxTasksVal) * graphHeight;

      lineCoords.push({ x: xPos, y: yPos, val: tVal });
      pointsString += `${xPos},${yPos} `;
    }

    // Polyline connector
    const polyline = document.createElementNS(svgNS, 'polyline');
    polyline.setAttribute('points', pointsString.trim());
    polyline.setAttribute('class', 'chart-line');
    chartSvg.appendChild(polyline);

    // Draw Line Points (Dots) and interactive markers
    lineCoords.forEach((pt, i) => {
      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', '4');
      circle.setAttribute('class', 'chart-dot');

      if (mode === 'weekly' && i === 2) {
        circle.setAttribute('r', '5'); // Wed dot is slightly bigger in UI
      }

      circle.addEventListener('mousemove', (e) => {
        circle.setAttribute('r', '7');
        tooltip.textContent = `${pt.val}개 과제 완료`;
        tooltip.classList.add('active');

        const wrapperRect = chartSvg.getBoundingClientRect();
        const absoluteX = e.clientX - wrapperRect.left;
        const absoluteY = e.clientY - wrapperRect.top;

        tooltip.style.left = `${absoluteX}px`;
        tooltip.style.top = `${absoluteY - 8}px`;
      });

      circle.addEventListener('mouseleave', () => {
        circle.setAttribute('r', (mode === 'weekly' && i === 2) ? '5' : '4');
        tooltip.classList.remove('active');
      });

      chartSvg.appendChild(circle);

      // Draw custom 수 Wednesday overlay text "8h" directly above Wednesday dot point!
      if (mode === 'weekly' && i === 2) {
        const valueText = document.createElementNS(svgNS, 'text');
        valueText.setAttribute('x', pt.x);
        valueText.setAttribute('y', pt.y - 12);
        valueText.setAttribute('class', 'chart-dot-active-text');
        valueText.textContent = `${hoursData[i]}h`;
        chartSvg.appendChild(valueText);
      }
    });

    // Draw X Axis labels
    for (let i = 0; i < nPoints; i++) {
      const xPos = margin.left + (i * colWidth) + (colWidth / 2);
      const yPos = height - margin.bottom + 18;

      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', xPos);
      label.setAttribute('y', yPos);
      label.setAttribute('text-anchor', 'middle');
      
      // Wednesday is bold in screenshot details
      if (mode === 'weekly' && i === 2) {
        label.setAttribute('class', 'chart-axis-text active');
      } else {
        label.setAttribute('class', 'chart-axis-text');
      }
      
      label.textContent = xLabels[i];
      chartSvg.appendChild(label);
    }
  }

  // ==========================================
  // 10. Initialization view startup
  // ==========================================
  switchView('home');

});
