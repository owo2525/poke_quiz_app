import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

const TYPE_MAP: Record<string, string> = {
  normal: 'ノーマル',
  fire: 'ほのお',
  water: 'みず',
  grass: 'くさ',
  electric: 'でんき',
  ice: 'こおり',
  fighting: 'かくとう',
  poison: 'どく',
  ground: 'じめん',
  flying: 'ひこう',
  psychic: 'エスパー',
  bug: 'むし',
  rock: 'いわ',
  ghost: 'ゴースト',
  dragon: 'ドラゴン',
  dark: 'あく',
  steel: 'はがね',
  fairy: 'フェアリー',
};

const ALL_TYPES = Object.keys(TYPE_MAP);

// クイズ出題API
app.get('/api/quiz', async (c) => {
  try {
    const id = Math.floor(Math.random() * 1010) + 1;
    const [pokeRes, speciesRes] = await Promise.all([
      fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then((r) => r.json()),
      fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`)
        .then((r) => r.json())
        .catch(() => null),
    ]);

    const name =
      speciesRes?.names?.find(
        (n: { language: { name: string }; name: string }) =>
          n.language.name === 'ja-Hrkt' || n.language.name === 'ja'
      )?.name || pokeRes.name;

    const actualTypes: string[] = pokeRes.types.map(
      (t: { type: { name: string } }) => t.type.name
    );
    const correctType =
      actualTypes[Math.floor(Math.random() * actualTypes.length)];

    const dummyPool = ALL_TYPES.filter((t) => !actualTypes.includes(t));
    const shuffledDummies = dummyPool
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const choices = [correctType, ...shuffledDummies]
      .sort(() => Math.random() - 0.5)
      .map((t) => ({ id: t, name: TYPE_MAP[t] || t }));

    return c.json({
      id,
      name,
      image:
        pokeRes.sprites?.other?.['official-artwork']?.front_default ||
        pokeRes.sprites?.front_default,
      choices,
      correctType,
      allTypes: actualTypes.map((t) => TYPE_MAP[t] || t),
    });
  } catch (error) {
    return c.json({ error: 'ポケモンの取得に失敗しました' }, 500);
  }
});

// クイズ画面
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ポケモン タイプクイズ</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #f0f4f8;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 16px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 24px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      text-align: center;
    }
    .score {
      font-size: 14px;
      color: #64748b;
      margin-bottom: 12px;
      font-weight: 600;
    }
    .poke-img-container {
      height: 180px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
    }
    .poke-img {
      max-height: 180px;
      max-width: 180px;
      object-fit: contain;
    }
    .poke-name {
      font-size: 24px;
      font-weight: bold;
      color: #1e293b;
      margin-bottom: 8px;
    }
    .question {
      font-size: 15px;
      color: #475569;
      margin-bottom: 20px;
    }
    .choices {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 16px;
    }
    button.choice {
      padding: 12px;
      font-size: 16px;
      font-weight: 600;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      background: white;
      color: #334155;
      cursor: pointer;
      transition: all 0.2s;
    }
    button.choice:hover:not(:disabled) {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    button.choice.correct {
      background: #dcfce7;
      border-color: #22c55e;
      color: #15803d;
    }
    button.choice.wrong {
      background: #fee2e2;
      border-color: #ef4444;
      color: #b91c1c;
    }
    #result {
      min-height: 48px;
      font-size: 15px;
      font-weight: bold;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .next-btn {
      width: 100%;
      padding: 12px;
      background: #3b82f6;
      color: white;
      font-size: 16px;
      font-weight: bold;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      display: none;
    }
    .next-btn:hover { background: #2563eb; }
    .loading { color: #94a3b8; font-size: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="score" id="score">スコア: 0 / 0</div>
    <div class="poke-img-container">
      <img id="pokeImg" class="poke-img" alt="Pokemon" style="display:none;" />
      <div id="loader" class="loading">ポケモンをさがしています...</div>
    </div>
    <div class="poke-name" id="pokeName">-</div>
    <div class="question">このポケモンのタイプは？</div>
    <div class="choices" id="choices"></div>
    <div id="result"></div>
    <button class="next-btn" id="nextBtn" onclick="loadQuiz()">次の問題へ</button>
  </div>

  <script>
    let currentQuiz = null;
    let total = 0;
    let score = 0;

    async function loadQuiz() {
      const loader = document.getElementById('loader');
      const pokeImg = document.getElementById('pokeImg');
      const pokeName = document.getElementById('pokeName');
      const choices = document.getElementById('choices');
      const result = document.getElementById('result');
      const nextBtn = document.getElementById('nextBtn');

      loader.style.display = 'block';
      pokeImg.style.display = 'none';
      pokeName.textContent = '読み込み中...';
      choices.innerHTML = '';
      result.textContent = '';
      nextBtn.style.display = 'none';

      try {
        const res = await fetch('/api/quiz');
        const data = await res.json();
        currentQuiz = data;

        pokeImg.src = data.image || '';
        pokeImg.onload = () => {
          loader.style.display = 'none';
          pokeImg.style.display = 'block';
        };
        pokeName.textContent = data.name;

        choices.innerHTML = '';
        data.choices.forEach(c => {
          const btn = document.createElement('button');
          btn.className = 'choice';
          btn.textContent = c.name;
          btn.onclick = () => answer(c.id, btn);
          choices.appendChild(btn);
        });
      } catch (err) {
        loader.textContent = 'エラーが発生しました';
      }
    }

    function answer(selectedTypeId, selectedBtn) {
      if (!currentQuiz) return;
      const allButtons = document.querySelectorAll('button.choice');
      allButtons.forEach(b => b.disabled = true);

      total++;
      const isCorrect = selectedTypeId === currentQuiz.correctType;
      if (isCorrect) score++;

      document.getElementById('score').textContent = 'スコア: ' + score + ' / ' + total;

      allButtons.forEach(b => {
        const choice = currentQuiz.choices.find(c => c.name === b.textContent);
        if (choice && choice.id === currentQuiz.correctType) {
          b.classList.add('correct');
        }
      });

      const result = document.getElementById('result');
      if (isCorrect) {
        result.innerHTML = '<span style="color: #16a34a;">正解！🎉</span><span style="font-size:13px;color:#64748b;">(タイプ: ' + currentQuiz.allTypes.join(', ') + ')</span>';
      } else {
        selectedBtn.classList.add('wrong');
        result.innerHTML = '<span style="color: #dc2626;">残念...正解は「' + currentQuiz.choices.find(c => c.id === currentQuiz.correctType)?.name + '」でした</span><span style="font-size:13px;color:#64748b;">(タイプ: ' + currentQuiz.allTypes.join(', ') + ')</span>';
      }

      document.getElementById('nextBtn').style.display = 'block';
    }

    loadQuiz();
  </script>
</body>
</html>`);
});

const port = 3000;
console.log(`Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
