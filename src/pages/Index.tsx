import { AlertTriangle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Index() {
  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-slate-900 border border-red-500/30 rounded-2xl p-8 md:p-12 shadow-2xl text-center space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="flex justify-center">
          <div className="bg-red-500/10 p-6 rounded-full ring-8 ring-red-500/5">
            <AlertTriangle className="w-16 h-16 text-red-500" />
          </div>
        </div>
        
        <div className="space-y-4">
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
            ESTA EXTENSÃO FOI PIRATEADA
          </h1>
          
          <div className="space-y-6">
            <p className="text-lg md:text-xl text-slate-300 leading-relaxed font-medium">
              A chave utilizada nesta extensão foi bloqueada por uso não autorizado. 
              Fale com o contato oficial abaixo para adquirir a versão original.
            </p>
            
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <p className="text-slate-400 text-sm uppercase tracking-widest font-semibold mb-2">
                Contato Oficial
              </p>
              <p className="text-2xl text-primary font-mono font-bold">
                (91) 98583-7992
              </p>
            </div>

            <p className="text-slate-400 italic">
              FALAR COM O CONTATO OFICIAL (91) 98583-7992 ou no botão abaixo
            </p>
          </div>
        </div>

        <div className="pt-4">
          <Button 
            asChild
            size="lg" 
            className="h-16 px-10 text-xl font-bold bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(22,163,74,0.4)] transition-all hover:scale-105 active:scale-95 gap-3"
          >
            <a href="https://wa.me/5591985837992" target="_blank" rel="noopener noreferrer">
              <MessageCircle className="w-6 h-6 fill-current" />
              CHAMAR NO WHATSAPP
            </a>
          </Button>
        </div>

        <div className="pt-8 border-t border-slate-800">
          <p className="text-xs text-slate-500 uppercase tracking-[0.2em]">
            SteelFlow Security Protocol • Version 2026.08
          </p>
        </div>
      </div>
    </main>
  );
}
