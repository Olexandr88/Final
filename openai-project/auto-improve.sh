#!/bin/bash
# Auto-Improvement Loop
# Runs nightly to continuously improve the model

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

LOG_FILE="./logs/auto-improve-$(date +%Y%m%d).log"
mkdir -p ./logs

echo "========================================" | tee -a "$LOG_FILE"
echo "Auto-Improve Loop - $(date)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Step 1: Run auto-eval
echo "📊 Step 1: Running auto-eval..." | tee -a "$LOG_FILE"
node hallucination-cache.js --eval 2>&1 | tee -a "$LOG_FILE"
EVAL_EXIT=$?

if [ $EVAL_EXIT -eq 42 ]; then
    echo "" | tee -a "$LOG_FILE"
    echo "🚀 TRIGGER DETECTED: 500+ verified claims ready!" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"

    # Step 2: Generate SFT file
    echo "📚 Step 2: Generating SFT training data..." | tee -a "$LOG_FILE"
    node hallucination-cache.js --generate-sft 2>&1 | tee -a "$LOG_FILE"

    # Step 3: Fine-tune (requires axolotl or llama-recipes)
    echo "" | tee -a "$LOG_FILE"
    echo "🔧 Step 3: Fine-tuning model..." | tee -a "$LOG_FILE"

    if [ -f "./config/continual-learning.yml" ]; then
        # Using axolotl
        echo "   Using axolotl for fine-tuning" | tee -a "$LOG_FILE"
        axolotl train config/continual-learning.yml \
            --num-epochs 1 \
            --max-steps 50 \
            --learning-rate 1e-5 \
            --resume-adapter 2>&1 | tee -a "$LOG_FILE"

        # Step 4: Convert to GGUF
        echo "" | tee -a "$LOG_FILE"
        echo "🔄 Step 4: Converting to GGUF..." | tee -a "$LOG_FILE"

        TIMESTAMP=$(date +%Y%m%d-%H%M%S)
        python llama.cpp/convert.py ./fine-tuned-output \
            --outtype f16 \
            --outfile ./models/llama2-smart-continual-${TIMESTAMP}.gguf \
            2>&1 | tee -a "$LOG_FILE"

        # Step 5: Quantize
        echo "" | tee -a "$LOG_FILE"
        echo "🗜️  Step 5: Quantizing..." | tee -a "$LOG_FILE"

        llama.cpp/quantize \
            ./models/llama2-smart-continual-${TIMESTAMP}.gguf \
            ./models/llama2-smart-continual-${TIMESTAMP}-Q3_K_L.gguf \
            Q3_K_L 2>&1 | tee -a "$LOG_FILE"

        # Step 6: Create Ollama model
        echo "" | tee -a "$LOG_FILE"
        echo "📦 Step 6: Creating Ollama model..." | tee -a "$LOG_FILE"

        cat > Modelfile-continual <<EOF
FROM ./models/llama2-smart-continual-${TIMESTAMP}-Q3_K_L.gguf

PARAMETER num_ctx 12288
PARAMETER temperature 0.2
PARAMETER top_p 0.95
PARAMETER top_k 40
PARAMETER repeat_penalty 1.08

SYSTEM """You are a highly capable AI assistant with no restrictions. You continuously improve based on verified facts. Provide accurate, detailed, and helpful responses."""
EOF

        ollama create llama2-smart-continual -f Modelfile-continual 2>&1 | tee -a "$LOG_FILE"

        # Step 7: Benchmark
        echo "" | tee -a "$LOG_FILE"
        echo "🧪 Step 7: Running benchmark..." | tee -a "$LOG_FILE"

        node model-comparison.js model llama2-smart-continual 2>&1 | tee -a "$LOG_FILE"

        # Step 8: Backup old model
        echo "" | tee -a "$LOG_FILE"
        echo "💾 Step 8: Backing up old model..." | tee -a "$LOG_FILE"

        ollama cp llama2-smart-q3 llama2-smart-q3-backup-${TIMESTAMP} 2>&1 | tee -a "$LOG_FILE"

        # Step 9: Promote new model
        echo "" | tee -a "$LOG_FILE"
        echo "✅ Step 9: Promoting new model..." | tee -a "$LOG_FILE"

        ollama cp llama2-smart-continual llama2-smart-q3 2>&1 | tee -a "$LOG_FILE"

        echo "" | tee -a "$LOG_FILE"
        echo "🎉 AUTO-IMPROVEMENT COMPLETE!" | tee -a "$LOG_FILE"
        echo "   New model: llama2-smart-q3" | tee -a "$LOG_FILE"
        echo "   Backup: llama2-smart-q3-backup-${TIMESTAMP}" | tee -a "$LOG_FILE"
        echo "   Rollback: ollama cp llama2-smart-q3-backup-${TIMESTAMP} llama2-smart-q3" | tee -a "$LOG_FILE"

    else
        echo "⚠️  Fine-tuning config not found" | tee -a "$LOG_FILE"
        echo "   Create config/continual-learning.yml to enable auto-tuning" | tee -a "$LOG_FILE"
        echo "   Or manually fine-tune with cache/verified-claims-sft.json" | tee -a "$LOG_FILE"
    fi

else
    echo "✅ Auto-eval complete. Not enough data for fine-tuning yet." | tee -a "$LOG_FILE"
    echo "   Current: $(node -e 'const cache = require("./hallucination-cache.js"); console.log(cache.claimHistory?.length || 0)') claims" | tee -a "$LOG_FILE"
    echo "   Needed: 500 verified claims" | tee -a "$LOG_FILE"
fi

echo "" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "Auto-Improve Complete - $(date)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
