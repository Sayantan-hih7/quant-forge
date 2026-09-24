FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY engine/requirements.lock ./requirements.lock
RUN pip install --no-cache-dir -r requirements.lock && useradd --create-home engine
COPY engine/quantforge ./quantforge
USER engine
EXPOSE 8100
CMD ["uvicorn", "quantforge.app:app", "--host", "0.0.0.0", "--port", "8100"]
