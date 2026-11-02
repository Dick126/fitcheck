FROM python:3.12-slim

WORKDIR /app

COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

COPY server/ ./server/
COPY web/ ./web/

WORKDIR /app/server

ENV FITCHECK_DB=/data/fitcheck.db \
    FITCHECK_SECRET=/data/secret.key \
    PYTHONUNBUFFERED=1

VOLUME /data
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
