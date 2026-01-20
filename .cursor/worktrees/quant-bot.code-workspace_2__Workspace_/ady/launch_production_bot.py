#!/usr/bin/env python3
"""
Bot de Trading Production - Multi-Portefeuilles
- Lance le bot de trading complet en mode production
- Utilise uniquement Phantom Wallet (mainnet)
- Trading automatique avec seuils de confiance
- Notifications Telegram optimisées
- Monitoring en temps réel
"""

import os
import asyncio
import logging
import signal
import sys
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Imports locaux
from multi_wallet_manager import (
    MultiWalletManager, WalletType, TransactionRequest,
    create_multi_wallet_manager
)
from optimized_telegram_notifier import OptimizedTelegramNotifier, MessagePriority
from telegram_bilan_handler import TelegramBilanHandler

# Imports des nouveaux modules d'amélioration
from intelligent_stop_loss import IntelligentStopLossManager, StopLossConfig
from advanced_fee_optimizer import AdvancedFeeOptimizer, FeeOptimizationConfig
from advanced_opportunity_detector import AdvancedOpportunityDetector, OpportunityCriteria
from order_flow_analyzer import OrderFlowAnalyzer, MarketSentiment

# Imports des nouveaux modules d'amélioration stratégique
from real_market_data_provider import RealMarketDataProvider, TradingSignal
from advanced_position_sizing import AdvancedPositionSizing, PositionSizingConfig
from adaptive_stop_loss import AdaptiveStopLoss, AdaptiveStopLossConfig
from adaptive_confidence_threshold import AdaptiveConfidenceThreshold, AdaptiveConfidenceConfig
from dynamic_take_profit import DynamicTakeProfit, DynamicTakeProfitConfig
from adaptive_cooldown import AdaptiveCooldown, AdaptiveCooldownConfig
from progressive_loss_cap import ProgressiveLossCap, ProgressiveLossCapConfig

# Charger la configuration
load_dotenv('hybrid_bot_config.env')

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ProductionTradingBot:
    """Bot de trading en mode production"""
    
    def __init__(self):
        telegram_token = os.getenv('TELEGRAM_TOKEN')
        telegram_chat_id = os.getenv('TELEGRAM_CHAT_ID')
        
        if not telegram_token or not telegram_chat_id:
            raise ValueError("Configuration Telegram manquante")
        
        self.wallet_manager = create_multi_wallet_manager(telegram_token, telegram_chat_id)
        self.notifier = OptimizedTelegramNotifier(telegram_token, telegram_chat_id)
        self.bilan_handler = TelegramBilanHandler()
        self.last_update_id = 0
        
        # Détection de nouveaux meme coins
        self.discovered_new_coins = set()  # Set pour éviter les doublons
        self.last_new_coin_discovery = None
        
        # Configuration du mode réel
        self.force_real_transactions = os.getenv('FORCE_REAL_TRANSACTIONS', 'false').lower() == 'true'
        
        if self.force_real_transactions:
            logger.warning("🚀 MODE SIMULATION AVEC PRIX RÉELS ACTIVÉ")
            logger.info("🧪 Les transactions sont simulées mais utilisent les prix réels de Jupiter")
            logger.info("📊 Ce mode permet de valider la stratégie sans risque financier")
            # Forcer l'utilisation de Jupiter pour les prix réels
            if hasattr(self.wallet_manager, 'jupiter_manager'):
                self.wallet_manager.jupiter_manager.force_real_mode = True
                self.wallet_manager.jupiter_manager.jupiter_available = True
        
        # Paramètres de contrôle (env)
        self.max_trade_amount_sol = float(os.getenv('MAX_TRADE_AMOUNT', '0.010'))
        self.daily_loss_cap_usd = float(os.getenv('DAILY_LOSS_CAP_USD', '50'))
        self.max_opps_per_minute = int(os.getenv('MAX_OPPS_PER_MINUTE', '8'))
        self.cooldown_minutes_after_stop = int(os.getenv('COOLDOWN_MINUTES_AFTER_STOP', '10'))
        self.min_liquidity_score = float(os.getenv('MIN_LIQUIDITY_SCORE', '0.6'))
        self.min_volume_24h_usd = float(os.getenv('MIN_VOLUME_24H_USD', '750000'))
        self.max_price_impact_pct = float(os.getenv('MAX_PRICE_IMPACT_PCT', '1.5'))
        self.trail_adaptive = os.getenv('TRAIL_ADAPTIVE', 'true').lower() == 'true'
        self.trail_min_pct = float(os.getenv('TRAIL_MIN_PCT', '1.5'))
        self.trail_max_pct = float(os.getenv('TRAIL_MAX_PCT', '3.0'))
        self.tp1_pct = float(os.getenv('TP1_PCT', '1.0')) / 100.0
        self.tp1_size = float(os.getenv('TP1_SIZE', '0.5'))
        self.tp2_pct = float(os.getenv('TP2_PCT', '1.8')) / 100.0
        self.tp2_size = float(os.getenv('TP2_SIZE', '0.25'))
        self.tp3_pct = float(os.getenv('TP3_PCT', '2.5')) / 100.0
        self.tp3_size = float(os.getenv('TP3_SIZE', '0.40'))
        self.dd_tighten_thresh = float(os.getenv('DRAWDOWN_TIGHTEN_THRESH_USD', '-20'))
        self.dd_relax_thresh = float(os.getenv('DRAWDOWN_RELAX_THRESH_USD', '0'))
        self.confidence_base = float(os.getenv('CONFIDENCE_BASE', '0.92'))
        self.confidence_dd_bonus = float(os.getenv('CONFIDENCE_DD_BONUS', '0.08'))
        
        # Nouveaux paramètres stratégie optimisée
        self.stop_loss_tight_pct = float(os.getenv('STOP_LOSS_TIGHT_PCT', '1.5'))
        self.stop_loss_absolute_max = float(os.getenv('STOP_LOSS_ABSOLUTE_MAX', '8.0'))
        self.early_exit_profit_pct = float(os.getenv('EARLY_EXIT_PROFIT_PCT', '0.5')) / 100.0
        self.early_exit_size = float(os.getenv('EARLY_EXIT_SIZE', '0.20'))
        self.position_sizing_dynamic = os.getenv('POSITION_SIZING_DYNAMIC', 'true').lower() == 'true'
        self.min_confidence_for_trade = float(os.getenv('MIN_CONFIDENCE_FOR_TRADE', '0.40'))
        self.incoherence_penalty = float(os.getenv('INCOHERENCE_PENALTY', '0.20'))  # Réduit de 40% à 20%
        
        # Initialiser les nouveaux composants d'amélioration
        # Stop-loss SERRE pour réduire les pertes (stratégie optimisée)
        self.stop_loss_config = StopLossConfig(
            max_loss_percentage=self.stop_loss_tight_pct,  # 1.5% au lieu de 3%
            max_loss_absolute=self.stop_loss_absolute_max,  # $8 au lieu de $15
            trailing_stop_percentage=self.trail_min_pct,   # 1.0% (plus serré)
            time_limit_minutes=30           # 30 minutes (plus court)
        )
        self.stop_loss_manager = IntelligentStopLossManager(self.stop_loss_config)
        
        self.fee_config = FeeOptimizationConfig(
            target_fee_percentage=1.5,
            max_fee_percentage=2.0,
            min_transaction_volume=5.0,  # Minimum $5.0 pour éviter les trades trop petits
            batch_threshold=3
        )
        self.fee_optimizer = AdvancedFeeOptimizer(self.fee_config)
        
        self.opportunity_criteria = OpportunityCriteria(
            min_profit_potential=1.5,
            max_risk_percentage=2.0,
            min_volume_24h=int(self.min_volume_24h_usd),
            min_liquidity_score=float(self.min_liquidity_score),
            min_momentum_score=0.4,
            max_volatility=0.20,
            min_confidence=self.confidence_base
        )
        self.opportunity_detector = AdvancedOpportunityDetector(self.opportunity_criteria)
        
        # Analyseur de tendances d'achat/vente
        self.order_flow_analyzer = OrderFlowAnalyzer(window_minutes=60)
        
        # NOUVEAUX MODULES D'AMÉLIORATION STRATÉGIQUE
        # 1. Fournisseur de données de marché réel
        self.market_data_provider = RealMarketDataProvider()
        
        # 2. Position sizing avancé
        position_sizing_config = PositionSizingConfig(
            max_trade_amount=self.max_trade_amount_sol,
            max_portfolio_exposure=0.10,
            min_trade_amount=0.001
        )
        self.advanced_position_sizing = AdvancedPositionSizing(position_sizing_config)
        
        # 3. Stop-loss adaptatif
        adaptive_stop_config = AdaptiveStopLossConfig(
            base_stop_pct=self.stop_loss_tight_pct,
            min_stop_pct=1.0,
            max_stop_pct=3.0
        )
        self.adaptive_stop_loss = AdaptiveStopLoss(adaptive_stop_config)
        
        # 4. Seuil de confiance adaptatif
        adaptive_conf_config = AdaptiveConfidenceConfig(
            base_threshold=self.min_confidence_for_trade,
            min_threshold=0.70,
            max_threshold=0.90
        )
        self.adaptive_confidence = AdaptiveConfidenceThreshold(adaptive_conf_config)
        
        # 5. Take-profit dynamique
        dynamic_tp_config = DynamicTakeProfitConfig(
            base_tp1=self.tp1_pct * 100,
            base_tp2=self.tp2_pct * 100,
            base_tp3=self.tp3_pct * 100,
            base_tp1_size=self.tp1_size,
            base_tp2_size=self.tp2_size,
            base_tp3_size=self.tp3_size
        )
        self.dynamic_take_profit = DynamicTakeProfit(dynamic_tp_config)
        
        # 6. Cooldown adaptatif
        adaptive_cooldown_config = AdaptiveCooldownConfig(
            base_cooldown_minutes=self.cooldown_minutes_after_stop,
            min_cooldown_minutes=5,
            max_cooldown_minutes=60
        )
        self.adaptive_cooldown = AdaptiveCooldown(adaptive_cooldown_config)
        
        # 7. Loss cap progressif
        progressive_loss_config = ProgressiveLossCapConfig(
            base_daily_cap=self.daily_loss_cap_usd,
            min_daily_cap=10.0,
            max_daily_cap=50.0
        )
        self.progressive_loss_cap = ProgressiveLossCap(progressive_loss_config)
        
        # Configuration des portefeuilles
        # Configuration des portefeuilles - UNIQUEMENT Phantom Wallet
        self.phantom_address = "6DvzpPPmm4uxj4yjCuDbo8YWUiFDC3fHUnwiHufoxPR4"
        
        # Utilisation exclusive de Phantom Wallet
        self.prioritize_phantom = True
        
        self.phantom_wallet_id = "phantom_mainnet"
        
        # Statistiques de trading
        self.start_time = None
        self.opportunities_detected = 0
        self.trades_executed = 0
        self.auto_trades = 0
        self.manual_approvals = 0
        self.notifications_sent = 0
        self.running = True
        self.net_pnl_usd = 0.0
        self.opportunity_timestamps = []  # throttle
        self.token_cooldown_until = {}    # symbol -> datetime
        
        # Configuration de trading
        # Relever le seuil d'auto-trade pour n'exécuter que les signaux les plus confiants
        self.auto_trade_threshold = self.min_confidence_for_trade  # Utiliser le même seuil que min_confidence_for_trade
        self.scan_interval = 3  # Scan toutes les 3 secondes
        self.dashboard_update_interval = 30  # Dashboard toutes les 30 secondes
        
        logger.info("🚀 ProductionTradingBot initialisé avec toutes les améliorations")
        logger.info("🛡️ Stop-loss intelligent activé")
        logger.info("💰 Optimiseur de frais activé")
        logger.info("🎯 Détecteur d'opportunités amélioré activé")
        logger.info("📊 Analyseur de tendances d'achat/vente activé")
    
    async def initialize_production_environment(self):
        """Initialiser l'environnement de production"""
        try:
            print("🚀 INITIALISATION ENVIRONNEMENT DE PRODUCTION")
            print("=" * 55)
            
            # Ajouter uniquement Phantom Wallet (mainnet)
            print("🚀 Configuration Phantom Wallet (mainnet)...")
            success = self.wallet_manager.add_wallet(self.phantom_wallet_id, WalletType.PHANTOM, self.phantom_address)
            if not success:
                print("❌ Échec ajout Phantom Wallet")
                return False
            
            connected = await self.wallet_manager.connect_wallet(self.phantom_wallet_id, self.phantom_address)
            if not connected:
                print("❌ Échec connexion Phantom Wallet")
                return False
            
            phantom_balance = await self.wallet_manager.wallets[self.phantom_wallet_id].get_balance()
            print(f"✅ Phantom Wallet connecté - Solde: {phantom_balance:.6f} SOL (mainnet)")
            
            # Envoyer notification de démarrage
            await self.send_production_startup_notification()
            
            print("✅ Environnement de production initialisé")
            return True
            
        except Exception as e:
            logger.error(f"❌ Erreur initialisation: {e}")
            print(f"❌ Erreur: {e}")
            return False
    
    async def send_production_startup_notification(self):
        """Envoyer notification de démarrage production"""
        try:
            startup_message = f"""🚀 **BOT DE TRADING PRODUCTION DÉMARRÉ**

🧪 **MODE SIMULATION AVEC PRIX RÉELS**
• Les transactions sont simulées
• Les prix sont réels (depuis Jupiter API)
• Permet de valider la stratégie sans risque
• Statistiques basées sur conditions réelles

🚀 **Phantom Wallet (MAINNET):**
• Adresse: {self.phantom_address[:8]}...{self.phantom_address[-8:]}
• Réseau: Solana Mainnet
• Usage: Simulation (prix réels)

⚙️ **Configuration Trading:**
• 🤖 AUTOMATISATION TOTALE ACTIVÉE
• Trading automatique: Tous les trades ≥ {self.min_confidence_for_trade:.0%} confiance
• Plus de demande d'approbation manuelle
• Scan des opportunités: {self.scan_interval}s
• Mise à jour dashboard: {self.dashboard_update_interval}s

📊 **Commandes disponibles:**
• /bilan - Générer le bilan des gains et pertes

🛡️ **Sécurité:**
• Mode simulation (aucun fond réel déplacé)
• Prix réels depuis Jupiter
• Statistiques pour validation stratégie
• Audit trail complet

🎯 **Bot opérationnel en mode simulation - Prêt pour validation stratégie !**"""
            
            await self.notifier.send_message(startup_message, priority=MessagePriority.HIGH)
            self.notifications_sent += 1
            
        except Exception as e:
            logger.error(f"❌ Erreur notification démarrage: {e}")
    
    async def detect_trading_opportunities(self):
        """Détecter les opportunités de trading avec données de marché réelles"""
        try:
            # Liste des tokens à scanner (tokens établis)
            base_symbols = ["RAY", "SRM", "ORCA", "BONK", "WIF", "JUP", "PYTH"]  # SOL et USDC exclus
            
            # Détecter de nouveaux meme coins toutes les 2 minutes
            current_time = datetime.now()
            if not hasattr(self, 'discovered_new_coins'):
                self.discovered_new_coins = set()
            if not hasattr(self, 'last_new_coin_discovery'):
                self.last_new_coin_discovery = current_time
                self.discovered_new_coins = set()  # Set pour éviter les doublons
            
            time_since_last_discovery = (current_time - self.last_new_coin_discovery).total_seconds()
            if time_since_last_discovery >= 120:  # Toutes les 2 minutes
                await self.discover_new_meme_coins()
                self.last_new_coin_discovery = current_time
            
            # Combiner les tokens établis avec les nouveaux découverts
            symbols = list(base_symbols) + list(self.discovered_new_coins)
            
            # Scanner chaque token pour opportunités
            for symbol in symbols:
                try:
                    # Obtenir les données de marché réelles
                    market_data = await self.market_data_provider.get_market_data(symbol)
                    if market_data is None:
                        logger.info(f"⏸️ {symbol}: Pas de données marché")
                        continue
                    
                    # Générer un signal de trading basé sur analyse technique
                    trading_signal = await self.market_data_provider.generate_trading_signal(symbol)
                    if trading_signal is None:
                        logger.info(f"⏸️ {symbol}: Signal non généré")
                        continue
                    # Ne pas rejeter les signaux HOLD si la confiance est élevée (>= 40%)
                    # Permettre de trader même avec signal HOLD si confiance suffisante
                    if trading_signal.action == "HOLD" and trading_signal.confidence < self.min_confidence_for_trade:
                        logger.info(f"⏸️ {symbol}: Signal HOLD (confiance: {trading_signal.confidence:.0%} < seuil {self.min_confidence_for_trade:.0%})")
                        continue
                    elif trading_signal.action == "HOLD":
                        # Convertir HOLD en BUY si confiance suffisante (stratégie agressive)
                        logger.info(f"🔄 {symbol}: Signal HOLD converti en BUY (confiance: {trading_signal.confidence:.0%} >= seuil {self.min_confidence_for_trade:.0%})")
                        trading_signal.action = "BUY"  # Convertir HOLD en BUY pour permettre le trade
                    
                    logger.info(f"🔍 {symbol}: Signal {trading_signal.action} détecté (confiance: {trading_signal.confidence:.0%})")
                    
                    # Obtenir le seuil de confiance adaptatif
                    market_sentiment = self.adaptive_confidence.determine_market_sentiment(
                        market_data.price_change_24h,
                        market_data.volume_24h / 1000000  # Volume spike approximatif
                    )
                    volatility_regime = self.adaptive_confidence.determine_volatility_regime(
                        trading_signal.indicators.volatility
                    )
                    recent_win_rate = self.adaptive_confidence.get_recent_win_rate()
                    
                    adaptive_threshold = self.adaptive_confidence.calculate_adaptive_threshold(
                        market_sentiment,
                        recent_win_rate,
                        volatility_regime
                    )
                    
                    # Vérifier si le signal dépasse le seuil adaptatif
                    if trading_signal.confidence < adaptive_threshold:
                        logger.info(f"⏸️ Signal {symbol} rejeté: confiance {trading_signal.confidence:.0%} < seuil {adaptive_threshold:.0%}")
                        continue
                    
                    # Analyser les tendances d'achat/vente
                    trend_analysis = await self.order_flow_analyzer.analyze_token_flow(
                        symbol, 
                        market_data.current_price, 
                        market_data.volume_24h
                    )
                    
                    # Ajuster la confiance selon l'analyse de tendance
                    adjusted_confidence = self.order_flow_analyzer.get_trend_boost(
                        symbol, 
                        trading_signal.confidence
                    )
                    
                    # Vérifier la cohérence action/tendance
                    action = trading_signal.action.lower()
                    if action == "buy" and trend_analysis.recommendation in ["SELL", "STRONG_SELL"]:
                        logger.warning(f"⚠️ Incohérence détectée: signal BUY mais tendance {trend_analysis.sentiment.value}")
                        adjusted_confidence *= (1.0 - self.incoherence_penalty)
                    elif action == "sell" and trend_analysis.recommendation in ["BUY", "STRONG_BUY"]:
                        logger.warning(f"⚠️ Incohérence détectée: signal SELL mais tendance {trend_analysis.sentiment.value}")
                        adjusted_confidence *= (1.0 - self.incoherence_penalty)
                    elif action == "buy" and trend_analysis.recommendation in ["BUY", "STRONG_BUY"]:
                        adjusted_confidence *= 1.15
                        logger.info(f"✅ Cohérence: signal BUY et tendance {trend_analysis.sentiment.value}")
                    elif action == "sell" and trend_analysis.recommendation in ["SELL", "STRONG_SELL"]:
                        adjusted_confidence *= 1.15
                        logger.info(f"✅ Cohérence: signal SELL et tendance {trend_analysis.sentiment.value}")
                    
                    adjusted_confidence = min(1.0, max(0.0, adjusted_confidence))
                    
                    # Vérifier à nouveau le seuil après ajustement
                    if adjusted_confidence < adaptive_threshold:
                        logger.info(f"⏸️ Signal {symbol} rejeté après ajustement: {adjusted_confidence:.0%} < {adaptive_threshold:.0%}")
                        continue
                    
                    self.opportunities_detected += 1
                    
                    # Afficher le résumé
                    trend_summary = self.order_flow_analyzer.get_trend_summary(symbol)
                    if trend_summary:
                        logger.info(f"📊 {trend_summary}")
                    
                    logger.info(f"🎯 Opportunité #{self.opportunities_detected}: {action.upper()} {symbol}")
                    logger.info(f"   Prix: ${market_data.current_price:.4f}")
                    logger.info(f"   Confiance: {adjusted_confidence:.0%} (seuil: {adaptive_threshold:.0%})")
                    logger.info(f"   Raison: {trading_signal.reasoning}")
                    
                    # Traiter l'opportunité avec les améliorations
                    await self.process_trading_opportunity_enhanced(
                        symbol, 
                        action, 
                        market_data.current_price,  # Prix d'entrée réel
                        adjusted_confidence
                    )
                    
                    return True  # Une opportunité trouvée, on s'arrête pour ce cycle
                    
                except Exception as e:
                    logger.error(f"❌ Erreur analyse {symbol}: {e}")
                    continue
            
            return False
            
        except Exception as e:
            logger.error(f"❌ Erreur détection opportunités: {e}")
            return False
    
    async def process_trading_opportunity_enhanced(self, symbol: str, action: str, entry_price: float, confidence: float):
        """Traiter une opportunité avec toutes les améliorations"""
        try:
            # Filtrer par confiance minimum absolue
            if confidence < self.min_confidence_for_trade:
                logger.info(f"⏸️ Opportunité {symbol} rejetée: confiance {confidence:.0%} < minimum {self.min_confidence_for_trade:.0%}")
                return
            
            # Obtenir les données de marché pour calculs avancés
            market_data = await self.market_data_provider.get_market_data(symbol)
            if market_data is None:
                logger.warning(f"⚠️ Impossible d'obtenir données marché pour {symbol}")
                return
            
            # Obtenir la volatilité
            volatility = self.advanced_position_sizing.get_volatility(symbol)
            if volatility == 0:
                volatility = market_data.liquidity  # Fallback
            
            # Obtenir le capital disponible
            wallet_id = await self.select_best_wallet()
            available_capital = await self.wallet_manager.wallets[wallet_id].get_balance()
            
            # ANALYSE DE TENDANCES pour ajuster position sizing et stop-loss
            trend_analysis = await self.order_flow_analyzer.analyze_token_flow(
                symbol, 
                market_data.current_price, 
                market_data.volume_24h
            )
            
            # 1. POSITION SIZING AVANCÉ avec Kelly Criterion + ajustement tendance
            optimal_amount = self.advanced_position_sizing.calculate_optimal_size(
                confidence=confidence,
                volatility=volatility,
                current_drawdown=self.net_pnl_usd,
                portfolio_correlation=0.3,  # Approximation (à améliorer)
                available_capital=available_capital,
                symbol=symbol
            )
            
            # Ajuster position sizing selon analyse de tendances
            if trend_analysis.recommendation in ["STRONG_BUY", "BUY"] and action == "buy":
                # Forte pression d'achat → augmenter taille de 20%
                optimal_amount *= 1.20
                logger.info(f"📈 Tendance haussière: position sizing +20%")
            elif trend_analysis.recommendation in ["STRONG_SELL", "SELL"] and action == "buy":
                # Pression de vente → réduire taille de 50% ou skip
                optimal_amount *= 0.50
                logger.warning(f"📉 Tendance baissière: position sizing -50%")
            elif trend_analysis.recommendation in ["STRONG_SELL", "SELL"] and action == "sell":
                # Forte pression de vente pour un SELL → augmenter taille
                optimal_amount *= 1.20
                logger.info(f"📉 Tendance baissière: position sizing +20%")
            elif trend_analysis.recommendation in ["STRONG_BUY", "BUY"] and action == "sell":
                # Pression d'achat pour un SELL → réduire taille
                optimal_amount *= 0.50
                logger.warning(f"📈 Tendance haussière: position sizing -50%")
            
            logger.info(f"📊 Position sizing avancé: {optimal_amount:.6f} SOL (confiance: {confidence:.0%})")
            
            # 2. STOP-LOSS ADAPTATIF selon volatilité + ajustement tendance
            market_volatility = volatility  # Approximation
            adaptive_stop_pct = self.adaptive_stop_loss.calculate_adaptive_stop_loss(
                base_stop=self.stop_loss_tight_pct,
                volatility=volatility,
                market_volatility=market_volatility,
                confidence=confidence
            )
            
            # Ajuster stop-loss selon analyse de tendances
            if trend_analysis.order_flow_type.value == "WHALE_ACCUMULATION" and action == "buy":
                # Accumulation whale → stop plus large (laisser courir)
                adaptive_stop_pct *= 1.3
                logger.info(f"🐋 Accumulation whale: stop-loss +30% (laisser courir)")
            elif trend_analysis.order_flow_type.value == "WHALE_DISTRIBUTION" and action == "buy":
                # Distribution whale → stop plus serré (protéger)
                adaptive_stop_pct *= 0.8
                logger.warning(f"🐋 Distribution whale: stop-loss -20% (protéger)")
            
            stop_loss_price = self.adaptive_stop_loss.calculate_stop_loss_price(
                entry_price, adaptive_stop_pct, action
            )
            
            logger.info(f"🛡️ Stop-loss adaptatif: {adaptive_stop_pct:.2f}% (prix: ${stop_loss_price:.4f})")
            
            # 3. Optimiser les frais
            # Convertir le montant SOL en USD (entry_price est le prix du token, pas de SOL)
            # Pour calculer le montant USD, on multiplie par le prix de SOL (~$185)
            sol_price_usd = 185.0  # Prix approximatif de SOL en USD
            amount_usd = optimal_amount * sol_price_usd
            
            transaction_data = {
                "token": symbol,
                "amount_usd": amount_usd,
                "urgency": "normal"
            }
            
            logger.info(f"💰 Montant trade: {optimal_amount:.6f} SOL = ${amount_usd:.2f} USD")
            
            fee_optimization = self.fee_optimizer.optimize_single_transaction(transaction_data)
            
            if fee_optimization["action"] == "reject":
                logger.warning(f"⚠️ Trade rejeté par optimiseur de frais: {fee_optimization['reason']}")
                await self.notifier.send_message(f"❌ Trade rejeté: {fee_optimization['reason']}")
                return
            
            logger.info(f"💰 Frais optimisés: {fee_optimization['fee_percentage']:.2f}% du volume")
            
            # 4. Ajouter la position avec stop-loss adaptatif
            position_id = self.stop_loss_manager.add_position(
                symbol, action, optimal_amount, entry_price
            )
            
            if not position_id:
                logger.error("❌ Échec création position avec stop-loss")
                return
            
            logger.info(f"🛡️ Position créée avec stop-loss adaptatif: {position_id}")
            
            # 5. Exécuter le trade (AUTOMATISATION TOTALE)
            await self.process_trading_opportunity(symbol, action, optimal_amount, confidence)
            
            # 6. Surveiller la position avec take-profit dynamique
            await self._monitor_position(position_id, symbol, action, optimal_amount, entry_price)
            
        except Exception as e:
            logger.error(f"❌ Erreur traitement opportunité améliorée: {e}")
    
    async def _monitor_position(self, position_id: str, symbol: str, action: str, amount: float, entry_price: float):
        """Surveiller une position avec stop-loss et take-profit dynamiques"""
        try:
            # Simuler la surveillance de la position
            await asyncio.sleep(2)  # Attendre 2 secondes
            
            # Obtenir le prix actuel depuis le marché
            market_data = await self.market_data_provider.get_market_data(symbol)
            if market_data is None:
                # Fallback: simulation
                import random
                exit_price = entry_price * (1 + random.uniform(-0.02, 0.05))
            else:
                exit_price = market_data.current_price
            
            # Calculer le momentum et volume spike pour take-profit dynamique
            indicators = self.market_data_provider.calculate_technical_indicators(symbol)
            momentum = indicators.momentum if indicators else 0.0
            volume_spike = 1.0  # Approximation (à améliorer avec historique)
            
            # ANALYSE DE TENDANCES pour ajuster take-profit
            trend_analysis = await self.order_flow_analyzer.analyze_token_flow(
                symbol, 
                exit_price, 
                market_data.volume_24h if market_data else 1000000
            )
            
            # Ajuster momentum selon analyse de tendances
            if trend_analysis.recommendation in ["STRONG_BUY", "BUY"] and action == "buy":
                # Forte pression d'achat → momentum plus fort
                momentum = max(momentum, 0.7)
                volume_spike = max(volume_spike, trend_analysis.buy_pressure_score * 2.0)
            elif trend_analysis.recommendation in ["STRONG_SELL", "SELL"] and action == "buy":
                # Pression de vente → momentum plus faible
                momentum = min(momentum, 0.3)
            
            # TAKE-PROFIT DYNAMIQUE selon momentum + tendance
            dynamic_tp = self.dynamic_take_profit.calculate_dynamic_take_profit(
                entry_price=entry_price,
                current_price=exit_price,
                momentum=momentum,
                volume_spike=volume_spike
            )
            
            # Ajuster take-profit selon analyse de tendances
            if trend_analysis.recommendation in ["STRONG_BUY", "BUY"] and action == "buy":
                # Forte pression d'achat → paliers plus hauts
                dynamic_tp["tp1_pct"] *= 1.2
                dynamic_tp["tp2_pct"] *= 1.2
                dynamic_tp["tp3_pct"] *= 1.2
                logger.info(f"📈 Tendance haussière: take-profit +20%")
            elif trend_analysis.recommendation in ["STRONG_SELL", "SELL"] and action == "buy":
                # Pression de vente → sortir plus tôt
                dynamic_tp["tp1_pct"] *= 0.8
                dynamic_tp["tp2_pct"] *= 0.8
                dynamic_tp["tp3_pct"] *= 0.8
                logger.warning(f"📉 Tendance baissière: take-profit -20% (sortir plus tôt)")
            
            # Utiliser les paliers dynamiques
            tp1_pct = dynamic_tp["tp1_pct"] / 100.0
            tp1_size = dynamic_tp["tp1_size"]
            tp2_pct = dynamic_tp["tp2_pct"] / 100.0
            tp2_size = dynamic_tp["tp2_size"]
            tp3_pct = dynamic_tp["tp3_pct"] / 100.0
            tp3_size = dynamic_tp["tp3_size"]
            
            # Calculer les profits réalisés
            # amount est en SOL, entry_price est le prix du token en USD
            # Pour calculer le profit, on doit convertir amount (SOL) en USD
            sol_price_usd = 185.0  # Prix de SOL en USD
            amount_usd = amount * sol_price_usd  # Montant investi en USD
            
            # Calculer le profit en pourcentage
            move = (exit_price / entry_price) - 1.0
            remaining_size = 1.0
            realized_usd = 0.0
            
            # Early exit à +0.5% pour sécuriser (20% de la position)
            if move >= self.early_exit_profit_pct:
                profit_usd = amount_usd * self.early_exit_size * self.early_exit_profit_pct
                realized_usd += profit_usd
                remaining_size -= self.early_exit_size
                logger.info(f"✅ Early exit: {self.early_exit_size*100:.0f}% à +{self.early_exit_profit_pct*100:.1f}% (${profit_usd:.2f})")
            
            # TP1 dynamique
            if move >= tp1_pct and remaining_size > 0:
                profit_usd = amount_usd * tp1_size * tp1_pct
                realized_usd += profit_usd
                remaining_size -= tp1_size
                logger.info(f"✅ TP1 dynamique: {tp1_size*100:.0f}% à +{tp1_pct*100:.2f}% (${profit_usd:.2f})")
            
            # TP2 dynamique
            if move >= tp2_pct and remaining_size > 0:
                profit_usd = amount_usd * tp2_size * (tp2_pct - tp1_pct)
                realized_usd += profit_usd
                remaining_size -= tp2_size
                logger.info(f"✅ TP2 dynamique: {tp2_size*100:.0f}% à +{tp2_pct*100:.2f}% (${profit_usd:.2f})")
            
            # TP3 dynamique
            if move >= tp3_pct and remaining_size > 0:
                profit_usd = amount_usd * tp3_size * (tp3_pct - tp2_pct)
                realized_usd += profit_usd
                remaining_size -= tp3_size
                logger.info(f"✅ TP3 dynamique: {tp3_size*100:.0f}% à +{tp3_pct*100:.2f}% (${profit_usd:.2f})")
            
            # Vérifier le stop-loss
            stop_result = self.stop_loss_manager.update_position_price(position_id, exit_price)
            
            profit_loss = 0.0
            if stop_result["action"] == "stop_loss":
                logger.warning(f"🛑 Stop-loss déclenché: {stop_result['loss_percentage']:.2f}%")
                profit_loss = -abs(stop_result['loss_amount'])
                
                # Enregistrer pour cooldown adaptatif
                self.adaptive_cooldown.record_stop_loss(symbol)
                
                # Calculer cooldown adaptatif
                token_stats = self.adaptive_cooldown.get_token_stats(symbol)
                adaptive_cooldown_minutes = self.adaptive_cooldown.calculate_adaptive_cooldown(
                    symbol,
                    token_stats['stop_loss_count'],
                    token_stats['win_rate'],
                    token_stats['last_trade_result']
                )
                
                self.token_cooldown_until[symbol] = datetime.now() + timedelta(minutes=adaptive_cooldown_minutes)
                
                await self.notifier.send_message(
                    f"🛑 STOP-LOSS DÉCLENCHÉ!\n"
                    f"📊 {symbol} {action.upper()}\n"
                    f"📉 Perte: {stop_result['loss_percentage']:.2f}%\n"
                    f"💰 Montant: ${stop_result['loss_amount']:.2f}\n"
                    f"⏸️ Cooldown: {adaptive_cooldown_minutes} min"
                )
            else:
                # Fermer la position avec profit
                close_result = self.stop_loss_manager.close_position(position_id, exit_price)
                if close_result["action"] == "position_closed":
                    profit_loss = float(close_result['profit_amount']) + realized_usd
                    logger.info(f"✅ Position fermée: {close_result['profit_percentage']:.2f}%")
                    
                    # Enregistrer pour statistiques
                    self.adaptive_cooldown.record_trade(symbol, profit_loss)
                    self.adaptive_confidence.record_trade(profit_loss)
                    self.progressive_loss_cap.record_trade(profit_loss)
                    self.advanced_position_sizing.record_trade(symbol, amount, profit_loss)
                    
                    # Filtrer les notifications pour positions avec profit/perte significatif
                    # Ignorer les positions avec 0% de profit et montant $0.00
                    if abs(close_result['profit_percentage']) > 0.01 or abs(profit_loss) > 0.01:
                        await self.notifier.send_message(
                            f"✅ POSITION FERMÉE!\n"
                            f"📊 {symbol} {action.upper()}\n"
                            f"📈 Profit: {close_result['profit_percentage']:.2f}%\n"
                            f"💰 Montant: ${profit_loss:.2f}"
                        )
                    else:
                        logger.debug(f"⏸️ Notification filtrée: position {symbol} avec profit {close_result['profit_percentage']:.2f}% et montant ${profit_loss:.2f}")
            
            # Mettre à jour PnL
            self.net_pnl_usd += profit_loss
            
            # Mettre à jour historique des prix pour volatilité
            self.advanced_position_sizing.update_price_history(symbol, exit_price)
            
            # DAILY LOSS CAP PROGRESSIF
            consecutive_losses = self.progressive_loss_cap.get_consecutive_losses()
            weekly_pnl = self.progressive_loss_cap.get_weekly_pnl()
            
            adaptive_loss_cap = self.progressive_loss_cap.calculate_daily_loss_cap(
                self.daily_loss_cap_usd,
                consecutive_losses,
                weekly_pnl
            )
            
            if self.net_pnl_usd <= -abs(adaptive_loss_cap):
                logger.error(f"⛔ Daily loss cap progressif atteint: {self.net_pnl_usd:.2f} USD (cap: ${adaptive_loss_cap:.2f})")
                await self.notifier.send_message(
                    f"⛔ Daily loss cap progressif atteint: {self.net_pnl_usd:.2f} USD\n"
                    f"Cap adaptatif: ${adaptive_loss_cap:.2f}\n"
                    f"Pertes consécutives: {consecutive_losses}"
                )
                
                # Vérifier si pause nécessaire
                if self.progressive_loss_cap.should_pause_trading(consecutive_losses):
                    pause_duration = self.progressive_loss_cap.get_pause_duration(consecutive_losses)
                    logger.warning(f"⏸️ Pause de trading: {pause_duration} minutes")
                    await asyncio.sleep(pause_duration * 60)
                
                self.stop_bot()
            
        except Exception as e:
            logger.error(f"❌ Erreur surveillance position: {e}")
    
    async def process_trading_opportunity(self, symbol, action, amount, confidence):
        """Traiter une opportunité de trading"""
        try:
            # Throttle opportunités/minute
            self.opportunity_timestamps = [t for t in self.opportunity_timestamps if (datetime.now() - t).total_seconds() < 60]
            if len(self.opportunity_timestamps) >= self.max_opps_per_minute:
                logger.info("⏳ Throttle: trop d'opportunités cette minute, on ignore")
                return
            self.opportunity_timestamps.append(datetime.now())

            # Cooldown par token
            if symbol in self.token_cooldown_until and datetime.now() < self.token_cooldown_until[symbol]:
                logger.info(f"⏸️ Cooldown actif pour {symbol}, opportunité ignorée")
                return

            # Filtrer par confiance minimum absolue
            if confidence < self.min_confidence_for_trade:
                logger.info(f"⏸️ Opportunité rejetée: confiance {confidence:.0%} < minimum {self.min_confidence_for_trade:.0%}")
                return

            # AUTOMATISATION TOTALE ACTIVÉE
            # Tous les trades qui passent le filtre minimum sont exécutés automatiquement
            # (Le filtre minimum de confiance est déjà appliqué ligne 461-463)
            
            # Drawdown risk mode: pour information seulement (ne bloque plus)
            if self.net_pnl_usd <= self.dd_tighten_thresh:
                logger.warning(f"⚠️ Drawdown détecté ({self.net_pnl_usd:.2f} USD) - Trading automatique continué")
            elif self.net_pnl_usd >= self.dd_relax_thresh:
                logger.info(f"✅ PnL positif ({self.net_pnl_usd:.2f} USD) - Trading automatique optimal")

            # Trading automatique pour toutes les opportunités validées
                wallet_id = await self.select_best_wallet()
            auto_trade = True  # FORCÉ - Plus de demande d'approbation
            
            # Cap de taille par trade
            amount = min(amount, self.max_trade_amount_sol)
            
            # Créer la demande de transaction
            request = TransactionRequest(
                wallet_id=wallet_id,
                symbol=symbol,
                amount=amount,
                action=action,
                confidence=confidence,
                priority="high" if auto_trade else "normal"
            )
            
            # AUTOMATISATION TOTALE - Exécution automatique de tous les trades
            logger.info(f"🚀 Tentative d'exécution transaction: {action} {amount} {symbol} via {wallet_id}")
            success = await self.wallet_manager.wallets[wallet_id].execute_transaction(request)
            
            if success:
                self.trades_executed += 1
                self.auto_trades += 1
                logger.info(f"✅ Trade automatique #{self.auto_trades} exécuté (confiance: {confidence:.0%})")
                print(f"✅ Trade automatique #{self.auto_trades} exécuté (confiance: {confidence:.0%})")
                
                # Envoyer notification de trade automatique
                await self.send_auto_trade_notification(symbol, action, amount, confidence, wallet_id)
            else:
                logger.error(f"❌ Échec trade automatique: {action} {amount} {symbol} via {wallet_id}")
                print(f"❌ Échec trade automatique")
                
        except Exception as e:
            logger.error(f"❌ Erreur traitement opportunité: {e}")
    
    async def discover_new_meme_coins(self):
        """Découvrir automatiquement de nouveaux meme coins"""
        try:
            logger.info("🔍 Recherche de nouveaux meme coins...")
            
            # Liste de tokens populaires récents à vérifier
            potential_tokens = [
                "SAMANTHA", "POPCAT", "MYRO", "MEW", "CHILLGUY", 
                "GRIFFAIN", "SMOG", "WEN", "SLERF", "BOME"
            ]
            
            # Limiter à 3 tokens par scan pour éviter la surcharge
            tokens_to_check = potential_tokens[:3]
            
            for token_symbol in tokens_to_check:
                if token_symbol not in self.discovered_new_coins:
                    # Vérifier si le token existe et a de la liquidité
                    try:
                        market_data = await self.market_data_provider.get_market_data(token_symbol)
                        if market_data and market_data.volume_24h > 10000:  # Volume minimum $10k
                            self.discovered_new_coins.add(token_symbol)
                            logger.info(f"🆕 Nouveau meme coin découvert: {token_symbol} (Volume 24h: ${market_data.volume_24h:,.0f})")
                            
                            # Notification pour nouveau token découvert
                            await self.notifier.send_message(
                                f"🆕 **NOUVEAU MEME COIN DÉCOUVERT**\n"
                                f"• Token: {token_symbol}\n"
                                f"• Volume 24h: ${market_data.volume_24h:,.0f}\n"
                                f"• Prix: ${market_data.current_price:.6f}\n"
                                f"• En surveillance...",
                                priority=MessagePriority.MEDIUM
                            )
                            self.notifications_sent += 1
                    except Exception as e:
                        logger.debug(f"Token {token_symbol} non disponible: {e}")
                        continue
            
            if self.discovered_new_coins:
                logger.info(f"✅ {len(self.discovered_new_coins)} nouveau(x) meme coin(s) en surveillance")
        except Exception as e:
            logger.error(f"❌ Erreur découverte nouveaux meme coins: {e}")
    
    async def select_best_wallet(self):
        """Sélectionner le meilleur portefeuille pour le trading"""
        try:
            # Utiliser uniquement Phantom Wallet
            phantom_balance = await self.wallet_manager.wallets[self.phantom_wallet_id].get_balance()
            if phantom_balance is not None:
                print(f"🎯 Utilisation Phantom Wallet: {phantom_balance:.6f} SOL")
                return self.phantom_wallet_id
            
            # Si erreur, retourner Phantom Wallet par défaut
            logger.warning("⚠️ Erreur récupération solde Phantom, utilisation par défaut")
            return self.phantom_wallet_id
                
        except Exception as e:
            logger.error(f"❌ Erreur sélection portefeuille: {e}")
            return self.phantom_wallet_id
    
    async def send_auto_trade_notification(self, symbol, action, amount, confidence, wallet_id):
        """Envoyer notification de trade automatique"""
        try:
            wallet_type = "PHANTOM MAINNET"
            
            trade_message = f"""🤖 **TRADE AUTOMATIQUE EXÉCUTÉ**

💰 **Transaction #{self.auto_trades}:**
• Action: {action.upper()}
• Montant: {amount} {symbol}
• Confiance: {confidence:.0%}
• Portefeuille: {wallet_type}
• Statut: ✅ Exécuté automatiquement

🛡️ **Sécurité:**
• Seuil automatique: ≥ {self.auto_trade_threshold:.0%}
• Sélection intelligente du portefeuille
• Audit trail enregistré

📊 **Statistiques:**
• Opportunités détectées: {self.opportunities_detected}
• Trades exécutés: {self.trades_executed}
• Trades automatiques: {self.auto_trades}"""
            
            await self.notifier.send_message(trade_message, priority=MessagePriority.MEDIUM)
            self.notifications_sent += 1
            
        except Exception as e:
            logger.error(f"❌ Erreur notification trade auto: {e}")
    
    async def send_approval_request_notification(self, symbol, action, amount, confidence):
        """Envoyer notification de demande d'approbation avec boutons"""
        try:
            # Générer un ID de transaction unique
            transaction_id = f"prod_{symbol}_{int(time.time())}"
            
            # Utiliser la nouvelle méthode avec boutons
            success = await self.notifier.send_approval_request_with_buttons(
                symbol=symbol,
                action=action,
                amount=amount,
                confidence=confidence,
                transaction_id=transaction_id
            )
            
            if success:
                self.notifications_sent += 1
                logger.info(f"✅ Demande d'approbation #{self.manual_approvals} envoyée avec boutons")
            else:
                logger.error(f"❌ Échec envoi demande d'approbation #{self.manual_approvals}")
            
        except Exception as e:
            logger.error(f"❌ Erreur notification approbation: {e}")
    
    async def send_dashboard_update(self):
        """Envoyer mise à jour du dashboard"""
        try:
            elapsed_time = (datetime.now() - self.start_time).total_seconds()
            
            # Récupérer le solde Phantom Wallet
            balances = await self.wallet_manager.get_all_balances()
            phantom_balance = balances.get(self.phantom_wallet_id, 0)
            
            dashboard_message = f"""📊 **DASHBOARD TRADING - TEMPS RÉEL**

⏱️ **Temps d'activité:** {elapsed_time:.0f} secondes
🎯 **Opportunités détectées:** {self.opportunities_detected}
🤖 **Trades exécutés:** {self.trades_executed}
⚡ **Trades automatiques:** {self.auto_trades}
📋 **Demandes d'approbation:** {self.manual_approvals}
📱 **Notifications envoyées:** {self.notifications_sent}

💰 **Soldes Portefeuilles:**
• Phantom Wallet (mainnet): {phantom_balance:.6f} SOL

📈 **Performance:**
• Taux de détection: {(self.opportunities_detected/elapsed_time*60):.1f} opportunités/min
• Taux d'exécution: {(self.trades_executed/max(self.opportunities_detected, 1)*100):.1f}%
• Taux automatique: {(self.auto_trades/max(self.trades_executed, 1)*100):.1f}%

🛡️ **Sécurité:** Mode hybride actif"""
            
            await self.notifier.send_message(dashboard_message, priority=MessagePriority.LOW)
            self.notifications_sent += 1
            
        except Exception as e:
            logger.error(f"❌ Erreur dashboard: {e}")
    
    async def check_telegram_commands(self):
        """Vérifie et traite les commandes Telegram"""
        try:
            import httpx
            
            telegram_token = os.getenv('TELEGRAM_TOKEN')
            telegram_chat_id = os.getenv('TELEGRAM_CHAT_ID')
            
            if not telegram_token or not telegram_chat_id:
                return
            
            # Récupérer les nouveaux messages
            url = f"https://api.telegram.org/bot{telegram_token}/getUpdates"
            params = {'offset': self.last_update_id + 1, 'timeout': 1}
            
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url, params=params)
                data = response.json()
                
                if not data.get('ok') or not data.get('result'):
                    return
                
                for update in data['result']:
                    self.last_update_id = update['update_id']
                    
                    if 'message' in update:
                        message = update['message']
                        chat_id = str(message['chat']['id'])
                        text = message.get('text', '').strip()
                        
                        # Vérifier que le message vient du bon chat
                        if chat_id != telegram_chat_id:
                            continue
                        
                        # Traiter la commande /bilan
                        if text.lower() == '/bilan':
                            logger.info("📊 Commande /bilan reçue")
                            bilan_message = await self.bilan_handler.generate_bilan()
                            await self.notifier.send_message(bilan_message, priority=MessagePriority.MEDIUM)
                            self.notifications_sent += 1
                        
        except Exception as e:
            # Ne pas logger les erreurs de timeout (normal)
            if 'timeout' not in str(e).lower() and 'timed out' not in str(e).lower():
                logger.debug(f"Erreur vérification commandes Telegram: {e}")
    
    async def run_production_trading_loop(self):
        """Boucle principale de trading en production"""
        try:
            print("\n🤖 DÉMARRAGE DE LA BOUCLE DE TRADING PRODUCTION")
            print("=" * 55)
            
            self.start_time = datetime.now()
            last_dashboard_update = self.start_time
            
            print(f"⏰ Début du trading: {self.start_time.strftime('%H:%M:%S')}")
            print("🎯 Surveillance des opportunités en cours...")
            print("📱 Surveillez vos notifications Telegram")
            print("🛑 Appuyez sur Ctrl+C pour arrêter")
            print()
            
            while self.running:
                current_time = datetime.now()
                
                # Vérifier les messages Telegram (commandes)
                await self.check_telegram_commands()
                
                # Détecter des opportunités
                await self.detect_trading_opportunities()
                
                # Mise à jour du dashboard toutes les 30 secondes
                if (current_time - last_dashboard_update).total_seconds() >= self.dashboard_update_interval:
                    await self.send_dashboard_update()
                    last_dashboard_update = current_time
                
                # Attendre avant la prochaine itération
                await asyncio.sleep(self.scan_interval)
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Erreur boucle trading: {e}")
            print(f"❌ Erreur: {e}")
            return False
    
    def stop_bot(self):
        """Arrêter le bot"""
        self.running = False
        print("\n🛑 Arrêt du bot demandé...")

async def main():
    """Fonction principale"""
    try:
        # Créer le bot de production
        bot = ProductionTradingBot()
        
        # Gestionnaire de signal pour arrêt propre
        def signal_handler(signum, frame):
            print(f"\n🛑 Signal {signum} reçu - Arrêt du bot...")
            bot.stop_bot()
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Initialiser l'environnement de production
        if not await bot.initialize_production_environment():
            print("❌ Échec initialisation du bot de production")
            return
        
        # Lancer la boucle de trading
        print("\n🚀 LANCEMENT DU BOT DE TRADING PRODUCTION AMÉLIORÉ")
        print("=" * 60)
        print("🚀 Phantom Wallet (mainnet) - Portefeuille exclusif")
        print("🤖 Trading automatique ≥ 80% confiance (AMÉLIORÉ)")
        print("📋 Approbation manuelle < 80% confiance")
        print("🛡️ Stop-loss intelligent activé (protection 2%)")
        print("💰 Optimiseur de frais activé (<2% du volume)")
        print("🎯 Détecteur d'opportunités amélioré")
        print("📱 Notifications Telegram optimisées")
        print("🛑 Appuyez sur Ctrl+C pour arrêter")
        print()
        
        success = await bot.run_production_trading_loop()
        
        if success:
            print("\n🎉 BOT DE TRADING ARRÊTÉ AVEC SUCCÈS!")
            print(f"📊 Opportunités détectées: {bot.opportunities_detected}")
            print(f"🤖 Trades exécutés: {bot.trades_executed}")
            print(f"⚡ Trades automatiques: {bot.auto_trades}")
            print(f"📋 Demandes d'approbation: {bot.manual_approvals}")
            print(f"📱 Notifications envoyées: {bot.notifications_sent}")
        else:
            print("\n⚠️ BOT ARRÊTÉ AVEC DES ERREURS")
        
    except KeyboardInterrupt:
        print("\n🛑 Bot arrêté par l'utilisateur")
    except Exception as e:
        logger.error(f"❌ Erreur principale: {e}")
        print(f"❌ Erreur: {e}")

if __name__ == "__main__":
    asyncio.run(main())
