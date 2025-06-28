from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from kokoro import KPipeline
import soundfile as sf
import audiotsm
from audiotsm.io.array import ArrayReader, ArrayWriter
import torch
import numpy as np
import tempfile
import os
from typing import Optional

app = FastAPI(title="Browser TTS API", description="Text-to-Speech API using Kokoro")

# Initialize the pipeline globally
pipeline = KPipeline(lang_code='a')

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = 'af_heart'
    speed: Optional[float] = 1.2
    speed_boost: Optional[float] = 1.0

@app.get("/")
async def root():
    return {"message": "Browser TTS API is running!", "docs": "/docs"}

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/generate-audio")
async def generate_audio(request: TTSRequest, background_tasks: BackgroundTasks):
    """
    Generate audio from text using Kokoro TTS.
    
    - **text**: The text to convert to speech
    - **voice**: Voice to use (default: 'af_heart')
    - **speed**: Speech speed (default: 1.2)
    - **speed_boost**: Applies regular speed boost to the audio without pitch distortion using WSOLA (default: 1.0)
    """
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        if request.speed_boost <= 0:
            raise HTTPException(status_code=400, detail="Speed boost must be greater than 0")
        
        # Generate audio using the pipeline
        generator = pipeline(request.text, voice=request.voice, speed=request.speed)
        
        # Get the first audio chunk (assuming single output for simplicity)
        audio_data = None
        for i, (gs, ps, audio) in enumerate(generator):
            if i == 0:  # Take the first chunk
                audio_data = audio
                break
        
        if audio_data is None:
            raise HTTPException(status_code=500, detail="Failed to generate audio")
        
        # Apply speed boost without pitch distortion if speed_boost != 1.0
        if request.speed_boost != 1.0:
            # Convert to numpy array if it's a tensor
            if torch.is_tensor(audio_data):
                audio_numpy = audio_data.cpu().numpy()
            else:
                audio_numpy = audio_data
            
            # Ensure audio is in the right format (1D array, float)
            if audio_numpy.ndim > 1:
                audio_numpy = audio_numpy.flatten()
            audio_numpy = audio_numpy.astype(np.float32)
            
            # Apply WSOLA time stretching using audiotsm
            # speed_boost > 1.0 speeds up, speed_boost < 1.0 slows down
            
            # Reshape to (channels, samples) format expected by ArrayReader
            # AudioTSM expects shape (channels, samples), so reshape 1D to (1, samples)
            audio_2d = audio_numpy.reshape(1, -1)
            
            # Create reader from input audio
            reader = ArrayReader(audio_2d)
            
            # Create writer for output audio
            writer = ArrayWriter(1)  # 1 channel (mono)
            
            # Create WSOLA TSM and run it
            tsm = audiotsm.wsola(channels=1, speed=request.speed_boost)
            tsm.run(reader, writer)
            
            # Get the processed audio and flatten back to 1D
            audio_data = writer.data.flatten()
        
        # Create a temporary file to store the audio
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            sf.write(temp_file.name, audio_data, 24000)
            temp_file_path = temp_file.name
        
        # Return the audio file
        background_tasks.add_task(cleanup_temp_file, temp_file_path)
        return FileResponse(
            path=temp_file_path,
            media_type='audio/wav',
            filename='generated_audio.wav'
        )
        
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=f"Error generating audio: {str(e)}")

def cleanup_temp_file(file_path: str):
    """Clean up temporary file after response is sent"""
    try:
        os.unlink(file_path)
    except OSError:
        pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9942)
