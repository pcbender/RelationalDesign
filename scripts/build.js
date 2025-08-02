const fs = require('fs');
const path = require('path');

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .match(/\b[\w']+\b/g) || [];
}

function buildTfIdfVectors(articles) {
  const documents = articles.map(a => tokenize(a.snippet));
  const df = new Map();
  documents.forEach(doc => {
    const unique = new Set(doc);
    unique.forEach(word => df.set(word, (df.get(word) || 0) + 1));
  });
  const N = documents.length;
  const vectors = documents.map(doc => {
    const tf = {};
    doc.forEach(word => (tf[word] = (tf[word] || 0) + 1));
    const vec = {};
    Object.keys(tf).forEach(word => {
      const termFreq = tf[word] / doc.length;
      const idf = Math.log((N + 1) / ((df.get(word) || 0) + 1)) + 1; // add-one smoothing
      vec[word] = termFreq * idf;
    });
    return vec;
  });
  return vectors;
}

function cosineSimilarity(vecA, vecB) {
  const words = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  words.forEach(word => {
    const a = vecA[word] || 0;
    const b = vecB[word] || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  });
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function computeSimilarity(a, b, tfidfVectors) {
  const tagsA = new Set(a.tags || []);
  const tagsB = new Set(b.tags || []);
  const union = new Set([...tagsA, ...tagsB]);
  let tagSim = 0;
  if (union.size > 0) {
    const intersection = [...tagsA].filter(t => tagsB.has(t));
    tagSim = intersection.length / union.size;
  }
  const cosineSim = cosineSimilarity(tfidfVectors[a.index], tfidfVectors[b.index]);
  return tagSim > 0 ? tagSim : cosineSim;
}

function updateRelatedArticles(articles, topN = 5) {
  const tfidfVectors = buildTfIdfVectors(articles);
  const maxRelated = Math.min(topN, articles.length - 1);
  articles.forEach((article, i) => {
    article.index = i; // temporary index for tfidf lookup
  });
  articles.forEach((article, i) => {
    const scores = [];
    for (let j = 0; j < articles.length; j++) {
      if (i === j) continue;
      const sim = computeSimilarity(article, articles[j], tfidfVectors);
      scores.push({ article: articles[j], score: sim });
    }
    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, maxRelated);
    article.relatedArticles = top.map(entry => ({
      title: entry.article.title,
      url: entry.article.url,
    }));
  });
  articles.forEach(article => delete article.index);
  return articles;
}

function main() {
  const dataPath = path.join(__dirname, '../dist/data/articles.json');
  const raw = fs.readFileSync(dataPath, 'utf8');
  const articles = JSON.parse(raw);
  updateRelatedArticles(articles);
  fs.writeFileSync(dataPath, JSON.stringify(articles, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { computeSimilarity, updateRelatedArticles };
