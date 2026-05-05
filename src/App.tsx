/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { 
  Camera, 
  BookOpen, 
  Info, 
  Volume2, 
  Settings, 
  User,
  X, 
  ChevronRight, 
  Play, 
  Pause, 
  RotateCcw,
  Languages,
  Zap,
  Star,
  Film,
  MessageSquare,
  BookCopy,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface Review {
  user: string;
  comment: string;
  rating: number;
}

interface BookInfo {
  title: string;
  author: string;
  authorBio?: string;
  rating: string;
  sequels: string;
  reviews: Review[];
  hasMovie: boolean;
  movieInfo?: string;
  coverUrl?: string;
}

type AppState = 'idle' | 'scanning-cover' | 'scanning-page' | 'book-details' | 'reading';

const VOICES = [
  { id: 'Kore', name: 'Kore', gender: 'Feminino', style: 'Equilibrada' },
  { id: 'Puck', name: 'Puck', gender: 'Feminino', style: 'Suave' },
  { id: 'Charon', name: 'Charon', gender: 'Masculino', style: 'Profunda' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'Masculino', style: 'Forte' },
  { id: 'Zephyr', name: 'Zephyr', gender: 'Feminino', style: 'Leve' },
];

const LANGUAGES = [
  { id: 'pt-BR', name: 'Português' },
  { id: 'en-US', name: 'English' },
  { id: 'es-ES', name: 'Español' },
  { id: 'fr-FR', name: 'Français' },
];

// --- Components ---

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [showSettings, setShowSettings] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [bookInfo, setBookInfo] = useState<BookInfo | null>(null);
  const [scannedText, setScannedText] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  // TTS Settings
  const [voice, setVoice] = useState(VOICES[0].id);
  const [language, setLanguage] = useState(LANGUAGES[0].id);
  const [speed, setSpeed] = useState(1.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  // --- Camera Logic ---

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        return dataUrl;
      }
    }
    return null;
  };

  // --- AI Logic ---

  const analyzeCover = async (imageData: string) => {
    setIsLoading(true);
    try {
      const base64Data = imageData.split(',')[1];
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Analise esta capa de livro e retorne as seguintes informações em JSON: título, autor, nota (0-5 estrelas), sequências (se houver), uma lista de 3 críticas curtas de diferentes fontes, e se possui filme (com breve info se sim). Use o idioma do usuário (Português)." },
              { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              author: { type: Type.STRING },
              rating: { type: Type.STRING },
              sequels: { type: Type.STRING },
              reviews: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    user: { type: Type.STRING },
                    comment: { type: Type.STRING },
                    rating: { type: Type.NUMBER }
                  },
                  required: ["user", "comment", "rating"]
                }
              },
              hasMovie: { type: Type.BOOLEAN },
              movieInfo: { type: Type.STRING }
            },
            required: ["title", "author", "rating", "sequels", "reviews", "hasMovie"]
          }
        }
      });

      const data = JSON.parse(response.text || '{}');
      setBookInfo(data);
      setState('book-details');
    } catch (err) {
      console.error("Error analyzing cover:", err);
      alert("Erro ao analisar a capa do livro.");
    } finally {
      setIsLoading(false);
      stopCamera();
    }
  };

  const scanPage = async (imageData: string) => {
    setIsLoading(true);
    try {
      const base64Data = imageData.split(',')[1];
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Extraia todo o texto visível nesta página do livro. Retorne apenas o texto puro, sem comentários." },
              { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]
          }
        ]
      });

      setScannedText(response.text || '');
      setState('reading');
    } catch (err) {
      console.error("Error scanning page:", err);
      alert("Erro ao escanear a página.");
    } finally {
      setIsLoading(false);
      stopCamera();
    }
  };

  const generateSpeech = async () => {
    if (!scannedText) return;
    setIsLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Leia o seguinte texto em ${language}: ${scannedText}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice as any },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const url = `data:audio/mp3;base64,${base64Audio}`;
        setAudioUrl(url);
        setIsPlaying(true);
      }
    } catch (err) {
      console.error("Error generating speech:", err);
      alert("Erro ao gerar áudio.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- Effects ---

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed, audioUrl]);

  useEffect(() => {
    if (isPlaying && audioRef.current) {
      audioRef.current.play();
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // --- UI Handlers ---

  const handleScanCover = () => {
    setState('scanning-cover');
    startCamera();
  };

  const handleScanPage = () => {
    setState('scanning-page');
    startCamera();
  };

  const handleCapture = () => {
    const img = capturePhoto();
    if (img) {
      if (state === 'scanning-cover') {
        analyzeCover(img);
      } else if (state === 'scanning-page') {
        scanPage(img);
      }
    }
  };

  const reset = () => {
    stopCamera();
    setState('idle');
    setCapturedImage(null);
    setBookInfo(null);
    setScannedText('');
    setAudioUrl(null);
    setIsPlaying(false);
  };

  const handleSimulateJantarSecreto = () => {
    setBookInfo({
      title: "Jantar Secreto",
      author: "Raphael Montes",
      authorBio: "Raphael Montes (Rio de Janeiro, 1990) é um escritor e roteirista brasileiro de literatura policial. Seus livros foram traduzidos em mais de 25 países e tiveram os direitos de adaptação vendidos para o cinema e TV. É conhecido por seu estilo visceral e tramas psicológicas intensas.",
      rating: "4.6/5",
      sequels: "Não possui nenhuma sequência direta.",
      reviews: [
        { user: "The Guardian", comment: "Raphael Montes é capaz de aliar a atmosfera de suspense de um filme de Alfred Hitchcock ao humor negro de Quentin Tarantino.", rating: 5 },
        { user: "Folha de S.Paulo", comment: "Um marco no suspense brasileiro contemporâneo. Visceral e impossível de largar.", rating: 5 },
        { user: "Leitor Kindle", comment: "Fiquei chocado com o final. A escrita do Raphael é hipnotizante, mas prepare o estômago!", rating: 4 },
        { user: "Crítica Literária", comment: "Uma crítica social ácida disfarçada de thriller de terror. Genial.", rating: 5 }
      ],
      hasMovie: true,
      movieInfo: "Os direitos de adaptação foram adquiridos pela Warner Bros. e o projeto está em desenvolvimento como uma série/filme original.",
      coverUrl: "https://m.media-amazon.com/images/I/81vXv6+w6AL.jpg"
    });
    setState('book-details');
  };

  const FAMOUS_BOOKS = [
    {
      title: "Harry Potter e a Pedra Filosofal",
      author: "J.K. Rowling",
      coverUrl: "https://m.media-amazon.com/images/I/81S0vXv-YhL.jpg",
      rating: "4.9/5",
      sequels: "7 livros na série principal.",
      reviews: [{ user: "NY Times", comment: "Um clássico instantâneo que mudou a literatura infantil.", rating: 5 }],
      hasMovie: true,
      movieInfo: "Adaptado em 2001, iniciando uma das maiores franquias do cinema.",
      sampleText: "O Sr. e a Sra. Dursley, da rua dos Alfeneiros, n° 4, orgulhavam-se de dizer que eram perfeitamente normais, muito bem, obrigado. Eram as últimas pessoas no mundo que se esperaria que se metessem em alguma coisa estranha ou misteriosa, porque simplesmente não admitiam tal bobagem."
    },
    {
      title: "Harry Potter e a Câmara Secreta",
      author: "J.K. Rowling",
      coverUrl: "https://m.media-amazon.com/images/I/81S0vXv-YhL.jpg",
      rating: "4.8/5",
      sequels: "Segundo livro da série.",
      reviews: [{ user: "USA Today", comment: "Uma continuação brilhante que expande o mundo mágico.", rating: 5 }],
      hasMovie: true,
      movieInfo: "Lançado em 2002, dirigido por Chris Columbus.",
      sampleText: "Não era a primeira vez que uma discussão estalara à hora do café na rua dos Alfeneiros, número quatro. O Sr. Válter Dursley fora acordado às primeiras horas da manhã por um ruído de pio alto vindo do quarto de seu sobrinho, Harry."
    },
    {
      title: "Harry Potter e o Prisioneiro de Azkaban",
      author: "J.K. Rowling",
      coverUrl: "https://m.media-amazon.com/images/I/81S0vXv-YhL.jpg",
      rating: "4.9/5",
      sequels: "Terceiro livro da série.",
      reviews: [{ user: "Guardian", comment: "O ponto de virada da série, mais sombrio e complexo.", rating: 5 }],
      hasMovie: true,
      movieInfo: "Considerado por muitos um dos melhores filmes da franquia, dirigido por Alfonso Cuarón.",
      sampleText: "Harry Potter era um menino fora do comum em muitos aspectos. Para começar, ele detestava as férias de verão mais do que qualquer outra época do ano. Depois, ele realmente queria fazer o seu dever de casa, mas fora obrigado a fazê-lo às escondidas, na calada da noite."
    },
    {
      title: "Harry Potter e o Cálice de Fogo",
      author: "J.K. Rowling",
      coverUrl: "https://m.media-amazon.com/images/I/81S0vXv-YhL.jpg",
      rating: "4.8/5",
      sequels: "Quarto livro da série.",
      reviews: [{ user: "Independent", comment: "Uma escala épica com o Torneio Tribruxo.", rating: 5 }],
      hasMovie: true,
      movieInfo: "Lançado em 2005, introduz o retorno épico de Lord Voldemort.",
      sampleText: "Os moradores de Little Hangleton ainda chamavam o casarão de Casa dos Riddle, embora já fizesse muitos anos que a família Riddle morara ali. Situava-se no alto de uma colina que dominava a aldeia."
    },
    {
      title: "Harry Potter e a Ordem da Fênix",
      author: "J.K. Rowling",
      coverUrl: "https://m.media-amazon.com/images/I/81S0vXv-YhL.jpg",
      rating: "4.7/5",
      sequels: "Quinto livro da série.",
      reviews: [{ user: "Observer", comment: "O livro mais longo e emocionalmente intenso da saga.", rating: 5 }],
      hasMovie: true,
      movieInfo: "Lançado em 2007, apresenta a terrível Dolores Umbridge.",
      sampleText: "O dia mais quente do verão até agora estava chegando ao fim e um silêncio modorrento pairava sobre as casas grandes e quadradas da rua dos Alfeneiros. Harry estava deitado de costas na grama, escondido sob a janela da sala de estar dos Dursley."
    },
    {
      title: "Harry Potter e o Enigma do Príncipe",
      author: "J.K. Rowling",
      coverUrl: "https://m.media-amazon.com/images/I/81S0vXv-YhL.jpg",
      rating: "4.9/5",
      sequels: "Sexto livro da série.",
      reviews: [{ user: "Telegraph", comment: "Revelações bombásticas sobre o passado de Voldemort.", rating: 5 }],
      hasMovie: true,
      movieInfo: "Lançado em 2009, foca no mistério das Horcruxes.",
      sampleText: "Estava chegando perto da meia-noite e o Primeiro-Ministro estava sentado sozinho em seu gabinete, lendo um longo memorando que passava por sua mente sem deixar o menor vestígio de significado."
    },
    {
      title: "Harry Potter e as Relíquias da Morte",
      author: "J.K. Rowling",
      coverUrl: "https://m.media-amazon.com/images/I/81S0vXv-YhL.jpg",
      rating: "5/5",
      sequels: "Conclusão épica da série Harry Potter.",
      reviews: [{ user: "Entertainment Weekly", comment: "Um final impecável para uma jornada lendária.", rating: 5 }],
      hasMovie: true,
      movieInfo: "Dividido em duas partes lançadas em 2010 e 2011.",
      sampleText: "Os dois homens apareceram do nada, a poucos metros de distância, na trilha estreita e iluminada pelo luar. Por um instante pararam imóveis, as varinhas apontadas um para o peito do outro, então se reconheceram."
    },
    {
      title: "Jogos Vorazes",
      author: "Suzanne Collins",
      coverUrl: "https://m.media-amazon.com/images/I/61I24wOsn8L.jpg",
      rating: "4.7/5",
      sequels: "Trilogia original + A Cantiga dos Pássaros e das Serpentes.",
      reviews: [{ user: "Stephen King", comment: "Viciante e aterrorizante. Não consegui parar de ler.", rating: 5 }],
      hasMovie: true,
      movieInfo: "Franquia de sucesso estrelada por Jennifer Lawrence.",
      sampleText: "Quando acordo, o outro lado da cama está frio. Meus dedos se esticam, procurando o calor de Prim, mas encontram apenas a lona áspera da cobertura do colchão. Ela deve ter tido pesadelos e subido na cama de nossa mãe. Claro que sim. Hoje é o dia da colheita."
    },
    {
      title: "Alice no País das Maravilhas",
      author: "Lewis Carroll",
      coverUrl: "https://m.media-amazon.com/images/I/91pB6uE-XHL.jpg",
      rating: "4.5/5",
      sequels: "Através do Espelho e o que Alice encontrou por lá.",
      reviews: [{ user: "Classic Review", comment: "Uma obra-prima do surrealismo e da lógica reversa.", rating: 5 }],
      hasMovie: true,
      movieInfo: "Inúmeras adaptações, incluindo o clássico da Disney e o filme de Tim Burton.",
      sampleText: "Alice estava começando a ficar muito cansada de estar sentada ao lado da irmã na ribanceira, e de não ter nada para fazer: uma ou duas vezes ela deu uma espiada no livro que a irmã estava lendo, mas não tinha figuras nem diálogos, 'e de que serve um livro', pensou Alice, 'sem figuras nem diálogos?'"
    },
    {
      title: "Dom Casmurro",
      author: "Machado de Assis",
      coverUrl: "https://m.media-amazon.com/images/I/81A6+3aMofL.jpg",
      rating: "4.8/5",
      sequels: "Não possui.",
      reviews: [{ user: "Crítica Clássica", comment: "A maior obra da literatura brasileira. Capitu traiu ou não?", rating: 5 }],
      hasMovie: true,
      movieInfo: "Diversas adaptações para TV e cinema, incluindo a minissérie 'Capitu'.",
      sampleText: "Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz aqui do bairro, que eu conheço de vista e de chapéu. Cumprimentou-me, sentou-se ao pé de mim, falou da Lua e dos ministros, e acabou recitando-me versos."
    },
    {
      title: "O Pequeno Príncipe",
      author: "Antoine de Saint-Exupéry",
      coverUrl: "https://m.media-amazon.com/images/I/71YyOub6vVL.jpg",
      rating: "4.9/5",
      sequels: "Não possui.",
      reviews: [{ user: "Mundo Literário", comment: "Um livro para todas as idades sobre o que realmente importa.", rating: 5 }],
      hasMovie: true,
      movieInfo: "Inúmeras animações e filmes live-action.",
      sampleText: "Certa vez, quando eu tinha seis anos, vi uma imagem magnífica num livro sobre a Floresta Virgem que se chamava Histórias Vividas. Representava uma jiboia engolindo uma fera. Eis a cópia do desenho."
    },
    {
      title: "1984",
      author: "George Orwell",
      coverUrl: "https://m.media-amazon.com/images/I/81StS9pT4hL.jpg",
      rating: "4.8/5",
      sequels: "Não possui.",
      reviews: [{ user: "Times", comment: "Uma visão profética e assustadora do futuro autoritário.", rating: 5 }],
      hasMovie: true,
      movieInfo: "Adaptado para o cinema em 1984, estrelado por John Hurt.",
      sampleText: "Era um dia frio e ensolarado de abril, e os relógios batiam treze horas. Winston Smith, o queixo fincado no peito no esforço de esquivar-se do vento agressivo, deslizou rapidamente pelas portas de vidro das Mansões Vitória, embora não com a rapidez necessária para evitar que uma lufada de poeira arenosa entrasse junto com ele."
    }
  ];

  const handleSelectSuggestion = (book: any, mode: 'read' | 'listen') => {
    setBookInfo({
      title: book.title,
      author: book.author,
      rating: book.rating,
      sequels: book.sequels,
      reviews: book.reviews,
      hasMovie: book.hasMovie,
      movieInfo: book.movieInfo,
      coverUrl: book.coverUrl
    });
    
    if (mode === 'read') {
      setScannedText(book.sampleText);
      setState('reading');
    } else {
      setScannedText(book.sampleText);
      setState('reading');
      // Trigger speech generation automatically if listening
      setTimeout(() => {
        generateSpeech();
      }, 500);
    }
    setShowSuggestions(false);
  };

  // --- Render Helpers ---

  const renderHeader = () => (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
          <BookOpen className="text-white w-5 h-5" />
        </div>
        <h1 className="font-sans font-bold text-xl tracking-tight">QRBook</h1>
      </div>
      <div className="flex items-center gap-2">
        {state === 'idle' ? (
          <button className="p-2 hover:bg-black/5 rounded-full transition-colors">
            <User className="w-6 h-6" />
          </button>
        ) : (
          <button 
            onClick={reset}
            className="p-2 hover:bg-black/5 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>
    </header>
  );

  return (
    <div className="min-h-screen bg-[#F9F9F9] text-black font-sans selection:bg-black selection:text-white">
      {renderHeader()}

      <main className="pt-24 pb-12 px-6 max-w-2xl mx-auto">
        <AnimatePresence mode="wait">
          {state === 'idle' && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="text-4xl font-bold tracking-tight leading-tight">
                  Sua biblioteca,<br />agora inteligente.
                </h2>
                <p className="text-black/60 text-lg">
                  Escaneie capas para saber tudo sobre um livro ou deixe que a IA leia as páginas para você.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button 
                  onClick={handleScanCover}
                  className="group relative overflow-hidden bg-white border border-black/5 p-8 rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col items-start gap-4 text-left"
                >
                  <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Camera className="text-white w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Escanear Capa</h3>
                    <p className="text-black/50">Autor, notas, sequências e filmes.</p>
                  </div>
                  <ChevronRight className="absolute right-8 top-1/2 -translate-y-1/2 text-black/20 group-hover:translate-x-2 transition-transform" />
                </button>

                <div className="flex gap-3">
                  <button 
                    onClick={handleScanPage}
                    className="flex-1 group relative overflow-hidden bg-white border border-black/5 p-8 rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col items-start gap-4 text-left"
                  >
                    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Volume2 className="text-white w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xl">Ouvir Livro</h3>
                      <p className="text-black/50">Transforme páginas físicas em audiolivro.</p>
                    </div>
                    <ChevronRight className="absolute right-8 top-1/2 -translate-y-1/2 text-black/20 group-hover:translate-x-2 transition-transform" />
                  </button>
                  
                  <button 
                    onClick={() => setShowSettings(true)}
                    className="w-20 bg-white border border-black/5 rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center gap-2 group"
                  >
                    <div className="w-10 h-10 bg-black/5 rounded-xl flex items-center justify-center group-hover:rotate-90 transition-transform">
                      <Settings className="w-5 h-5 text-black/60" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-tighter text-black/40">Config</span>
                  </button>
                </div>

                <button 
                  onClick={handleSimulateJantarSecreto}
                  className="group relative overflow-hidden bg-indigo-50 border border-indigo-100 p-8 rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col items-start gap-4 text-left"
                >
                  <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Zap className="text-white w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-indigo-950">Simular: Jantar Secreto</h3>
                    <p className="text-indigo-900/50">Veja como o app processa o best-seller.</p>
                  </div>
                  <ChevronRight className="absolute right-8 top-1/2 -translate-y-1/2 text-indigo-900/20 group-hover:translate-x-2 transition-transform" />
                </button>
              </div>

              <div className="fixed bottom-8 right-8 z-40">
                <button 
                  onClick={() => setShowSettings(true)}
                  className="w-14 h-14 bg-white border border-black/5 rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
                >
                  <Settings className="w-6 h-6 text-black/60" />
                </button>
              </div>

              {/* Botão de Sugestões Lado Esquerdo */}
              <div className="fixed left-0 top-1/2 -translate-y-1/2 z-40">
                <button 
                  onClick={() => setShowSuggestions(true)}
                  className="bg-black text-white py-6 px-3 rounded-r-2xl shadow-xl flex flex-col items-center gap-2 hover:pl-6 transition-all group"
                >
                  <Sparkles className="w-6 h-6 animate-pulse" />
                  <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-bold uppercase tracking-widest">Sugestões</span>
                </button>
              </div>

              {/* Modal de Sugestões */}
              <AnimatePresence>
                {showSuggestions && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowSuggestions(false)}
                      className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110]"
                    />
                    <motion.div 
                      initial={{ opacity: 0, x: -100 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className="fixed left-0 top-0 bottom-0 w-full max-w-sm bg-[#F9F9F9] shadow-2xl z-[111] overflow-y-auto custom-scrollbar"
                    >
                      <div className="p-8 space-y-8">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
                              <Sparkles className="text-white w-5 h-5" />
                            </div>
                            <h3 className="text-2xl font-bold tracking-tight">Famosos</h3>
                          </div>
                          <button 
                            onClick={() => setShowSuggestions(false)}
                            className="p-2 hover:bg-black/5 rounded-full"
                          >
                            <X className="w-6 h-6" />
                          </button>
                        </div>

                        <div className="space-y-6">
                          {FAMOUS_BOOKS.map((book, idx) => (
                            <div key={idx} className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm space-y-4">
                              <div className="flex gap-4">
                                <div className="w-20 aspect-[2/3] bg-black/5 rounded-lg overflow-hidden shadow-md flex-shrink-0 flex items-center justify-center">
                                  <img 
                                    src={book.coverUrl} 
                                    alt={book.title} 
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${book.title}/400/600`;
                                    }}
                                  />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-bold text-lg leading-tight">{book.title}</h4>
                                  <p className="text-sm text-black/50">{book.author}</p>
                                  <div className="flex items-center gap-1 text-amber-500 mt-2">
                                    <Star className="w-3 h-3 fill-current" />
                                    <span className="text-xs font-bold">{book.rating}</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2">
                                <button 
                                  onClick={() => handleSelectSuggestion(book, 'read')}
                                  className="flex items-center justify-center gap-2 py-3 bg-black text-white rounded-xl text-xs font-bold hover:bg-black/80 transition-all"
                                >
                                  <BookOpen className="w-4 h-4" /> Ler
                                </button>
                                <button 
                                  onClick={() => handleSelectSuggestion(book, 'listen')}
                                  className="flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all"
                                >
                                  <Volume2 className="w-4 h-4" /> Ouvir
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {/* Modal de Configurações Globais */}
              <AnimatePresence>
                {showSettings && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowSettings(false)}
                      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 100, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 100, scale: 0.95 }}
                      className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md w-full bg-white rounded-t-[40px] md:rounded-[40px] p-8 shadow-2xl z-[101] border border-black/5"
                    >
                      <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
                            <Settings className="text-white w-5 h-5" />
                          </div>
                          <h3 className="text-2xl font-bold tracking-tight">Configurações de Voz</h3>
                        </div>
                        <button 
                          onClick={() => setShowSettings(false)}
                          className="p-2 hover:bg-black/5 rounded-full"
                        >
                          <X className="w-6 h-6" />
                        </button>
                      </div>

                      <div className="space-y-6">
                        {/* Idioma */}
                        <div className="space-y-3">
                          <label className="text-xs font-bold uppercase tracking-widest text-black/40 flex items-center gap-2">
                            <Languages className="w-4 h-4" /> Idioma da Leitura
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {LANGUAGES.map(l => (
                              <button
                                key={l.id}
                                onClick={() => setLanguage(l.id)}
                                className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                                  language === l.id 
                                    ? 'bg-black text-white border-black' 
                                    : 'bg-white text-black border-black/5 hover:border-black/20'
                                }`}
                              >
                                {l.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Voz e Gênero */}
                        <div className="space-y-3">
                          <label className="text-xs font-bold uppercase tracking-widest text-black/40 flex items-center gap-2">
                            <Volume2 className="w-4 h-4" /> Escolha a Voz (Gênero/Estilo)
                          </label>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                            {VOICES.map(v => (
                              <button
                                key={v.id}
                                onClick={() => setVoice(v.id)}
                                className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${
                                  voice === v.id 
                                    ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500' 
                                    : 'bg-white border-black/5 hover:border-black/20'
                                }`}
                              >
                                <div className="text-left">
                                  <div className="font-bold text-sm">{v.name}</div>
                                  <div className="text-[10px] text-black/40 uppercase font-bold tracking-tighter">
                                    {v.gender} • {v.style}
                                  </div>
                                </div>
                                {voice === v.id && <div className="w-2 h-2 bg-emerald-500 rounded-full" />}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Velocidade */}
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-bold uppercase tracking-widest text-black/40">Velocidade da Fala</label>
                            <span className="text-sm font-bold bg-black/5 px-2 py-1 rounded-lg">{speed}x</span>
                          </div>
                          <input 
                            type="range" 
                            min="0.5" 
                            max="2.0" 
                            step="0.1" 
                            value={speed}
                            onChange={(e) => setSpeed(parseFloat(e.target.value))}
                            className="w-full h-2 bg-black/5 rounded-lg appearance-none cursor-pointer accent-black"
                          />
                        </div>

                        <button 
                          onClick={() => setShowSettings(false)}
                          className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:bg-black/90 transition-all mt-4"
                        >
                          Salvar Preferências
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {(state === 'scanning-cover' || state === 'scanning-page') && (
            <motion.div 
              key="camera"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black flex flex-col"
            >
              <div className="relative flex-1">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-[2px] border-white/30 m-12 rounded-3xl pointer-events-none flex items-center justify-center">
                  <div className="w-full h-[1px] bg-white/50 animate-pulse" />
                </div>
              </div>
              
              <div className="bg-black p-12 flex flex-col items-center gap-8">
                <p className="text-white/70 text-center font-medium">
                  {state === 'scanning-cover' ? 'Posicione a capa do livro no centro' : 'Posicione a página para leitura'}
                </p>
                <div className="flex items-center gap-12">
                  <button 
                    onClick={reset}
                    className="p-4 text-white/50 hover:text-white transition-colors"
                  >
                    <X className="w-8 h-8" />
                  </button>
                  <button 
                    onClick={handleCapture}
                    disabled={isLoading}
                    className="w-20 h-20 bg-white rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
                  >
                    {isLoading ? (
                      <div className="w-8 h-8 border-4 border-black/10 border-t-black rounded-full animate-spin" />
                    ) : (
                      <div className="w-16 h-16 border-2 border-black rounded-full" />
                    )}
                  </button>
                  <div className="w-8 h-8" /> {/* Spacer */}
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          )}

          {state === 'book-details' && bookInfo && (
            <motion.div 
              key="details"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="bg-white rounded-[40px] p-8 border border-black/5 shadow-xl space-y-6">
                <div className="flex flex-col md:flex-row gap-6">
                  {bookInfo.coverUrl && (
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="w-full md:w-48 aspect-[2/3] rounded-2xl overflow-hidden shadow-lg flex-shrink-0 bg-black/5 flex items-center justify-center"
                    >
                      <img 
                        src={bookInfo.coverUrl} 
                        alt={bookInfo.title} 
                        className="w-full h-full object-contain bg-white"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://picsum.photos/seed/book/400/600";
                        }}
                      />
                    </motion.div>
                  )}
                  <div className="space-y-4 flex-1">
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-black text-white text-xs font-bold rounded-full uppercase tracking-wider">
                        <Info className="w-3 h-3" /> Info do Livro
                      </div>
                      <h2 className="text-3xl font-bold tracking-tight">{bookInfo.title}</h2>
                      <p className="text-xl text-black/60">{bookInfo.author}</p>
                    </div>

                    {bookInfo.authorBio && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 font-bold text-sm text-black/40 uppercase tracking-widest">
                          Sobre o Autor
                        </div>
                        <p className="text-sm text-black/70 leading-relaxed">
                          {bookInfo.authorBio}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#F9F9F9] p-4 rounded-2xl space-y-1">
                    <div className="flex items-center gap-1 text-amber-500">
                      <Star className="w-4 h-4 fill-current" />
                      <span className="font-bold">Nota</span>
                    </div>
                    <p className="text-lg font-medium">{bookInfo.rating}</p>
                  </div>
                  <div className="bg-[#F9F9F9] p-4 rounded-2xl space-y-1">
                    <div className="flex items-center gap-1 text-emerald-500">
                      <BookCopy className="w-4 h-4" />
                      <span className="font-bold">Sequências</span>
                    </div>
                    <p className="text-sm text-black/70 leading-tight">{bookInfo.sequels}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 font-bold">
                      <MessageSquare className="w-5 h-5" /> Críticas da Comunidade
                    </div>
                    <div className="space-y-3">
                      {bookInfo.reviews.map((rev, idx) => (
                        <div key={idx} className="bg-[#F9F9F9] p-4 rounded-2xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-black/40 uppercase">{rev.user}</span>
                            <div className="flex gap-0.5">
                              {[...Array(5)].map((_, i) => (
                                <Star key={i} className={`w-3 h-3 ${i < rev.rating ? 'text-amber-500 fill-current' : 'text-black/10'}`} />
                              ))}
                            </div>
                          </div>
                          <p className="text-sm text-black/70 italic leading-relaxed">
                            "{rev.comment}"
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {bookInfo.hasMovie && (
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-2">
                      <div className="flex items-center gap-2 font-bold text-indigo-900">
                        <Film className="w-5 h-5" /> Adaptação para Cinema
                      </div>
                      <p className="text-indigo-800/80 text-sm leading-relaxed">
                        {bookInfo.movieInfo}
                      </p>
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleScanPage}
                  className="w-full bg-black text-white py-5 rounded-2xl font-bold text-lg hover:bg-black/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Volume2 className="w-6 h-6" />
                  Ler este livro agora
                </button>
              </div>
            </motion.div>
          )}

          {state === 'reading' && (
            <motion.div 
              key="reading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-[40px] p-8 border border-black/5 shadow-xl space-y-8">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full uppercase tracking-wider">
                    <Zap className="w-3 h-3" /> Modo Leitura
                  </div>
                  <button 
                    onClick={() => setState('idle')}
                    className="p-2 hover:bg-black/5 rounded-full"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                </div>

                <div className="max-h-[300px] overflow-y-auto pr-4 custom-scrollbar">
                  <p className="text-xl leading-relaxed text-black/80 font-serif">
                    {scannedText || "Nenhum texto detectado. Tente escanear novamente."}
                  </p>
                </div>

                <div className="space-y-6 pt-4 border-t border-black/5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-black/40 flex items-center gap-1">
                        <Languages className="w-3 h-3" /> Idioma
                      </label>
                      <select 
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full bg-[#F9F9F9] p-3 rounded-xl border-none font-medium focus:ring-2 focus:ring-black outline-none"
                      >
                        {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-black/40 flex items-center gap-1">
                        <Volume2 className="w-3 h-3" /> Voz
                      </label>
                      <select 
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                        className="w-full bg-[#F9F9F9] p-3 rounded-xl border-none font-medium focus:ring-2 focus:ring-black outline-none"
                      >
                        {VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold uppercase tracking-widest text-black/40">Velocidade</label>
                      <span className="text-xs font-bold">{speed}x</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="2.0" 
                      step="0.1" 
                      value={speed}
                      onChange={(e) => setSpeed(parseFloat(e.target.value))}
                      className="w-full h-2 bg-black/5 rounded-lg appearance-none cursor-pointer accent-black"
                    />
                  </div>

                  <div className="flex items-center justify-center gap-6 pt-4">
                    <button 
                      onClick={() => {
                        if (audioRef.current) audioRef.current.currentTime = 0;
                      }}
                      className="p-4 bg-[#F9F9F9] rounded-full hover:bg-black/5 transition-colors"
                    >
                      <RotateCcw className="w-6 h-6" />
                    </button>
                    
                    <button 
                      onClick={() => {
                        if (!audioUrl) {
                          generateSpeech();
                        } else {
                          setIsPlaying(!isPlaying);
                        }
                      }}
                      disabled={isLoading}
                      className="w-20 h-20 bg-black text-white rounded-full flex items-center justify-center shadow-lg shadow-black/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isLoading ? (
                        <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="w-8 h-8 fill-current" />
                      ) : (
                        <Play className="w-8 h-8 fill-current ml-1" />
                      )}
                    </button>

                    <button 
                      onClick={handleScanPage}
                      className="p-4 bg-[#F9F9F9] rounded-full hover:bg-black/5 transition-colors"
                    >
                      <Camera className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </div>
              
              {audioUrl && (
                <audio 
                  ref={audioRef} 
                  src={audioUrl} 
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.1);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
